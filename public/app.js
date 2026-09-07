import { propCard, flipCard } from "/prop-card.js";
import { normalizeGames, matchGame, showLock, weatherText } from "/game-context.js";
const endpoint = "/api/signals/live?historySeason=2025&limit=100&view=doctor-chart-v1";
const state = { signals: [], media: {}, teams: {}, games: [], notebook: {} };
const elements = { cards: document.querySelector("#cards"), empty: document.querySelector("#empty"), error: document.querySelector("#error"), count: document.querySelector("#count"), note: document.querySelector("#method-note"), theme: document.querySelector("#theme-toggle") };
const escapeHtml = (value) => String(value).replace(/[&<'"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]);
const number = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
const storyId = (signal) => `${signal.playerId}|${signal.marketKey}|${signal.eventId}`;

function setTheme(value) { const dark = value === "dark"; document.body.dataset.theme = dark ? "dark" : "light"; elements.theme.textContent = dark ? "Light mode" : "Dark mode"; elements.theme.setAttribute("aria-pressed", String(dark)); localStorage.setItem("drlocks-theme", dark ? "dark" : "light"); }
function sportsbookBadge(signal) { const book = signal.sportsbook ? String(signal.sportsbook).replace(/[_-]/g, " ") : ""; const normalized = book.toLowerCase(); if (normalized.includes("draftkings")) return `<span class="book-badge draftkings">DK</span>`; if (normalized.includes("fanduel")) return `<span class="book-badge fanduel">FD</span>`; if (normalized.includes("betmgm")) return `<span class="book-badge betmgm">MGM</span>`; if (normalized.includes("caesars")) return `<span class="book-badge caesars">C</span>`; return `<span class="book-badge multi">ODDS</span>`; }
function qualifyingSignals() { return state.signals.filter((signal) => signal.direction === "over" || signal.direction === "under").sort((a, b) => b.confidence - a.confidence || Math.abs(b.score) - Math.abs(a.score)); }
function side(signal) { return signal.direction === "over" ? "OVER" : "UNDER"; }
function playerPhoto(signal) { const photo = state.media[signal.playerId]?.headshot; return photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(signal.playerName)}" loading="lazy" />` : `<span>${escapeHtml(signal.position)}</span>`; }
function fact(signal) { const direction = side(signal).toLowerCase(); const defense = signal.defenseRankFewestAllowed <= 10 ? "a tough defense against this position" : signal.defenseRankFewestAllowed >= 23 ? "a defense that has struggled against this position" : "a middle-of-the-pack defense against this position"; return `In the last ${signal.recentGames} games, ${signal.playerName} averaged ${number(signal.recentAverage)} ${signal.marketLabel}. ${signal.opponentTeam} is ${defense}. This card examines the ${direction}.`; }
function plaque(signal, index) { return propCard(signal, state.media, index, state.teams, state.notebook); }
function kickoff(value) { if (!value) return "Kickoff time not listed"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? "Kickoff time not listed" : new Intl.DateTimeFormat(undefined, { weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit", timeZoneName:"short" }).format(date); }
function teamLogo(team) { const media = state.teams[team]; return media?.logo ? `<img src="${escapeHtml(media.logo)}" alt="${escapeHtml(team)} logo" />` : `<span>${escapeHtml(team)}</span>`; }
function gameHeader(game) {
  const pick = game[0], context = matchGame(pick, state.games);
  const away = pick.awayTeam || context?.away, home = pick.homeTeam || context?.home;
  const matchup = away && home ? `<div>${teamLogo(away)}<b>${escapeHtml(away)}</b></div><span>at</span><div>${teamLogo(home)}<b>${escapeHtml(home)}</b></div>` : `<strong>${escapeHtml(pick.matchup || "Matchup not listed")}</strong>`;
  return `<summary><div class="game-visual">${matchup}</div><div class="game-conditions"><span class="game-kickoff">Kickoff · ${escapeHtml(kickoff(pick.commenceAt || context?.start))}</span><span class="game-weather">${escapeHtml(weatherText(context))}</span><small>${escapeHtml(context?.venue || "Venue unavailable")}${context ? ` · ESPN forecast · checked ${escapeHtml(kickoff(context.fetchedAt))}` : ""}</small></div><span class="game-toggle">${game.length} ${game.length === 1 ? "pick" : "picks"} <span aria-hidden="true">⌄</span></span></summary>`;
}
function render() { const flipped = new Set([...elements.cards.querySelectorAll('.card-flip[aria-expanded="true"]')].map(button => button.dataset.cardLabel)); const collapsed = new Set([...elements.cards.querySelectorAll("details.game-board:not([open])")].map(el => el.dataset.event)); const picks = qualifyingSignals(); const games = new Map(); for (const pick of picks) games.set(pick.eventId, [...(games.get(pick.eventId) || []), pick]); const grouped = [...games.values()].sort((a, b) => b[0].confidence - a[0].confidence); elements.count.textContent = ""; elements.note.textContent = picks.length ? "Cards are sorted by confidence. Tap a card to flip it for the evidence. The Doctor Chart uses 2025 historical samples. Confidence is a model score, not a win probability." : "No line currently has enough evidence to earn a place on the board."; elements.empty.hidden = picks.length !== 0; elements.cards.innerHTML = grouped.map((game) => `<details class="game-board" data-event="${escapeHtml(game[0].eventId)}" ${collapsed.has(String(game[0].eventId)) ? "" : "open"}>${gameHeader(game)}<div class="plaque-grid">${game.map((signal) => plaque(signal, picks.indexOf(signal))).join("")}</div></details>`).join(""); for (const button of elements.cards.querySelectorAll(".card-flip")) if (flipped.has(button.dataset.cardLabel)) flipCard(button, true); }
async function loadGameContext() {
  try {
    const cached = JSON.parse(sessionStorage.getItem("drlocks-game-context") || "null");
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < 15 * 60000) { state.games = normalizeGames(cached.payload, cached.fetchedAt); return; }
  } catch {}
  try {
    const dates = state.signals.map(s => Date.parse(s.commenceAt)).filter(Number.isFinite);
    const start = new Date(dates.length ? Math.min(...dates) : Date.now());
    const end = new Date(dates.length ? Math.max(...dates) : Date.now() + 10 * 86400000);
    const ymd = date => date.toISOString().slice(0,10).replaceAll("-", "");
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${ymd(start)}-${ymd(end)}&limit=100`, {signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw Error("Schedule unavailable");
    const payload = await response.json(), fetchedAt = new Date().toISOString();
    const games = normalizeGames(payload, fetchedAt);
    if (!games.length) throw Error("No schedule events");
    state.games = games;
    try { sessionStorage.setItem("drlocks-game-context", JSON.stringify({payload,fetchedAt})); } catch {}
  } catch {
    try { const response = await fetch("/game-context-snapshot.json"); if(response.ok) { const saved=await response.json(); state.games=normalizeGames(saved.payload,saved.fetchedAt); } } catch {}
  }
}
async function load() { elements.error.hidden = true; const notesLoad = fetch("/doctor-chart-notes.json", {cache:"no-store"}).then(r => r.ok ? r.json() : {}).then(notes => { state.notebook = notes; }).catch(() => {}); const mediaLoad = Promise.all([fetch("/player-media.json", { cache:"force-cache" }), fetch("/team-media.json", { cache:"force-cache" })]).then(async ([players, teams]) => { if (players.ok) state.media = await players.json(); if (teams.ok) state.teams = await teams.json(); }).catch(() => {}); try { const response = await fetch(endpoint, { cache:"no-store" }); if (!response.ok) throw new Error(); const data = await response.json(); await Promise.all([mediaLoad, notesLoad]); state.signals = data.signals || []; render(); await loadGameContext(); render(); } catch (cause) { try { const fallback = await fetch("/fallback-signals.json", { cache:"no-store" }); if (!fallback.ok) throw cause; const data = await fallback.json(); await Promise.all([mediaLoad, notesLoad]); state.signals = data.signals || []; render(); await loadGameContext(); render(); elements.error.hidden = false; elements.error.textContent = "Live database refresh is temporarily unavailable. Showing the last saved research snapshot."; } catch { elements.error.hidden = false; elements.error.textContent = "Unable to load the research desk."; } } }
setTheme(localStorage.getItem("drlocks-theme") || "dark");
elements.theme.addEventListener("click", () => setTheme(document.body.dataset.theme === "dark" ? "light" : "dark"));
elements.cards.addEventListener("click", event => { const button = event.target.closest(".card-flip"); if (button) flipCard(button); });
elements.cards.addEventListener("keydown", event => { const button = event.target.closest(".card-flip"); if (button && event.key === "Escape") { flipCard(button, false); button.focus(); } });
load();
