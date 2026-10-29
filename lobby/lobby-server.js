"use strict";
const TEAMS = ["blue", "red"];
function createLobby({ players, send, broadcast, maxPlayers = 40, minPlayers = 1, allowLateJoin = true, onStart = () => {} }) {
  const perTeam = Math.floor(maxPlayers / 2);
  let phase = "lobby";
  let hostId = null;
  const list = () => [...players.values()];
  const count = team => list().filter(p => p.team === team).length;
  const pub = p => ({ id: p.id, name: p.name, team: p.team, ready: !!p.lobbyReady, host: p.id === hostId });
  const canStart = () => phase === "lobby" && list().length >= minPlayers && list().every(p => p.id === hostId || p.lobbyReady);
  const state = viewer => ({ type: "lobby-state", phase, hostId, you: viewer?.id || null, maxPerTeam: perTeam, canStart: canStart(), players: list().map(pub) });
  const pushState = () => list().forEach(p => send(p.ws, state(p)));
  const pickHost = () => { if (!players.has(hostId)) hostId = list()[0]?.id || null; };
  function onConnect(p) { p.lobbyReady = false; pickHost(); if (!hostId) hostId = p.id; pushState(); }
  function onDisconnect() { pickHost(); pushState(); if (phase === "playing" && players.size === 0) phase = "lobby"; }
  function setTeam(p, want) {
    if (phase !== "lobby") return send(p.ws, { type: "lobby-error", message: "Матч уже идёт." });
    let team = want;
    if (team === "auto") team = count("blue") <= count("red") ? "blue" : "red";
    if (!TEAMS.includes(team)) return;
    if (p.team !== team && count(team) >= perTeam) return send(p.ws, { type: "lobby-error", message: "Команда заполнена." });
    p.team = team; p.lobbyReady = false;
    broadcast({ type: "player", player: { id: p.id, name: p.name, team: p.team } });
    pushState();
  }
  function handle(p, msg) {
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("lobby-")) return false;
    switch (msg.type) {
      case "lobby-get": send(p.ws, state(p)); break;
      case "lobby-team": setTeam(p, msg.team); break;
      case "lobby-ready": if (phase === "lobby") { p.lobbyReady = msg.ready === true; pushState(); } break;
      case "lobby-start":
        if (p.id !== hostId) { send(p.ws, { type: "lobby-error", message: "Начать может только хост." }); return true; }
        if (!canStart()) { send(p.ws, { type: "lobby-error", message: "Не все игроки готовы." }); return true; }
        phase = "playing"; broadcast({ type: "lobby-started" }); pushState(); onStart(list()); break;
      case "lobby-reset":
        if (p.id === hostId) { phase = "lobby"; list().forEach(x => { x.lobbyReady = false; }); pushState(); }
        break;
    }
    return true;
  }
  const lateJoinAllowed = () => phase === "lobby" || allowLateJoin;
  return { onConnect, onDisconnect, handle, state, refresh: pushState, lateJoinAllowed, get phase() { return phase; }, get hostId() { return hostId; } };
}
module.exports = { createLobby, TEAMS };
