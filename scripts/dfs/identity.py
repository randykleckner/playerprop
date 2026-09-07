"""Conservative identity resolution; external namespaces never intermix."""
from collections import defaultdict
import re
import unicodedata

from .adapters import team
from .providers import ProviderError


def normalized_name(value):
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode().lower()
    tokens = re.sub(r"[^a-z0-9 ]", "", value).split()
    if tokens and tokens[-1] in {"jr", "sr", "ii", "iii", "iv"}:
        tokens.pop()
    return " ".join(tokens)


def map_identities(records: list[dict], canonical: list[dict], mappings: list[dict]) -> None:
    if any(not isinstance(p,dict) or not isinstance(p.get("player_id"),str) or not p["player_id"] for p in canonical):
        raise ProviderError("Canonical catalog requires nonempty canonical player IDs")
    by_id = {p["player_id"]:p for p in canonical}
    if len(by_id) != len(canonical):
        raise ProviderError("Duplicate canonical player IDs in catalog")
    stable, reviewed, names = defaultdict(set), defaultdict(set), defaultdict(set)
    for player in canonical:
        for namespace, value in player.get("external_ids", {}).items():
            if value is not None:
                stable[(namespace,str(value))].add(player["player_id"])
        for namespace in ("gsis_id","pfr_id","espn_id","nfl_id","draftkings_player_id","draftkings_player_dk_id"):
            if player.get(namespace):
                stable[(namespace,str(player[namespace]))].add(player["player_id"])
        names[(normalized_name(player.get("display_name")), team(player.get("current_team_id") or ""),
               player.get("position"))].add(player["player_id"])
    for mapping in mappings:
        if mapping.get("verified") in (True,1) and mapping.get("player_id") in by_id:
            reviewed[(mapping["namespace"],str(mapping["external_id"]))].add(mapping["player_id"])
    for row in records:
        row["player_id"] = None
        row["mapping_candidates"] = []
        flags = set(row.get("quality_flags", [])) - {"unresolved_player_mapping", "mapping_review_required"}
        if row["position"] == "DST":
            row["identity_status"] = "team_identity"
        else:
            ids = row.get("external_ids", {}).copy()
            # Draftable mappings must be explicitly namespaced, never treated as a stable DK player ID.
            if row.get("draftable_id"):
                ids["draftkings_draftable_id"] = row["draftable_id"]
            direct = set().union(*(stable[(k,str(v))] for k,v in ids.items()))
            known = set().union(*(reviewed[(k,str(v))] for k,v in ids.items()))
            candidates = direct or known
            # Conflicting stable and reviewed evidence requires human review even if one has precedence.
            conflicting = bool(direct and known and direct != known)
            if len(candidates)==1 and not conflicting:
                selected = next(iter(candidates))
                if by_id[selected].get("position") == row["position"]:
                    row["player_id"] = selected
                    row["identity_status"] = "stable_external_id" if direct else "verified_mapping"
                else:
                    row["identity_status"] = "position_conflict"
            elif candidates:
                row["identity_status"] = "ambiguous_external_id"
            else:
                candidates = names[(normalized_name(row.get("player_name")), row.get("team"), row["position"])]
                row["identity_status"] = "name_team_position_candidate" if len(candidates)==1 else "ambiguous_name" if candidates else "unresolved"
            row["mapping_candidates"] = sorted(candidates | known if conflicting else candidates)
            if not row["player_id"]:
                flags.add("unresolved_player_mapping")
                if candidates:
                    flags.add("mapping_review_required")
        row["quality_flags"] = sorted(flags)
    # Even a reviewed table may incorrectly collapse two provider players onto one canonical ID.
    matched = defaultdict(list)
    for row in records:
        if row["player_id"]:
            matched[row["player_id"]].append(row)
    for rows in matched.values():
        if len(rows)>1:
            for row in rows:
                row["player_id"] = None
                row["identity_status"] = "canonical_collision"
                row["quality_flags"] = sorted(set(row["quality_flags"]) | {"unresolved_player_mapping", "mapping_review_required"})
