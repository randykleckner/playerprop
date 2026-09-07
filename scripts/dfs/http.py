"""Anonymous GET-only transport with durable cache, cross-process rate limit and backoff."""
from email.utils import parsedate_to_datetime
import fcntl
import hashlib
import json
from pathlib import Path
import ssl
import time
import urllib.error
import urllib.request
import re

from .providers import ProviderError, iso, utc_now

USER_AGENT = "playerprop-nfl-salary-reader/1.0 (public salary research; anonymous read-only)"
MAX_RESPONSE = 12 * 1024 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class PublicSalaryClient:
    def __init__(self, directory: Path, config: dict, debug_after_lock=False):
        self.directory, self.config, self.debug_after_lock = directory, config, debug_after_lock
        self.directory.mkdir(parents=True, exist_ok=True)

    def get(self, url: str, kind: str, lock: str | None = None) -> dict:
        if not (url == "https://www.draftkings.com/lobby/getcontests?sport=NFL" or
                re.fullmatch(r"https://api\.draftkings\.com/draftgroups/v1/draftgroups/\d+/draftables", url)):
            raise ProviderError("Only the two public salary endpoints are permitted")
        if kind == "salary" and (not lock or iso(utc_now()) >= iso(lock)) and not self.debug_after_lock:
            raise ProviderError("Slate is locked or missing a lock time; refresh stopped")
        key = hashlib.sha256(url.encode()).hexdigest()
        with (self.directory / "request.lock").open("a+") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            return self._get_locked(url, kind, key)

    def _get_locked(self, url, kind, key):
        cache_path = self.directory / (key + ".json")
        state_path = self.directory / "request-state.json"
        cached = json.loads(cache_path.read_text()) if cache_path.exists() else None
        state = json.loads(state_path.read_text()) if state_path.exists() else {}
        now = time.time()
        ttl = max(1800, self.config["discovery_seconds"] if kind=="lobby" else self.config["refresh_seconds"])
        if cached and now-iso(cached["fetched_at"]).timestamp() < ttl:
            return cached
        if now < state.get("blocked_until", 0):
            raise ProviderError("Public salary feed is in error backoff; use cached output or CSV")
        delay = min(60,max(5, self.config["minimum_request_seconds"])) - (now-state.get("last_request", 0))
        if delay > 0:
            time.sleep(min(delay, 60))
        state["last_request"] = time.time()
        state_path.write_text(json.dumps(state))
        # No cookie jar, credential lookup, retries, proxy bypass or redirects.
        import certifi
        context = ssl.create_default_context(cafile=certifi.where())
        opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=context))
        request = urllib.request.Request(url, method="GET", headers={
            "Accept": "application/json", "User-Agent": USER_AGENT})
        try:
            with opener.open(request, timeout=30) as response:
                content = response.read(MAX_RESPONSE+1)
                if len(content)>MAX_RESPONSE:
                    raise ProviderError("DraftKings response exceeds 12 MiB")
                payload = json.loads(content)
                if not isinstance(payload, dict):
                    raise ProviderError("DraftKings returned a non-object response")
            observation = {"url":url, "fetched_at":utc_now(), "payload":payload}
            temporary = cache_path.with_suffix(".tmp")
            temporary.write_text(json.dumps(observation))
            temporary.replace(cache_path)
            return observation
        except (urllib.error.URLError, OSError, ValueError) as error:
            wait = max(3600, self.config["failure_backoff_seconds"])
            if isinstance(error, urllib.error.HTTPError):
                retry = error.headers.get("Retry-After", "")
                try:
                    wait = max(wait, int(retry) if retry.isdigit() else parsedate_to_datetime(retry).timestamp()-time.time())
                except (ValueError, TypeError, OverflowError):
                    pass
                message = f"HTTP {error.code} from public salary endpoint"
            else:
                message = f"Public salary request failed: {type(error).__name__}"
            state["blocked_until"] = time.time()+wait
            state_path.write_text(json.dumps(state))
            raise ProviderError(message) from error
