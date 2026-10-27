const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";
const GAME_FILE = path.join(__dirname, "villagestrategy_albion_prototype (2).html");
const MAX_PLAYERS = 40;
const players = new Map();

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    return res.end("ok");
  }
  if (req.url === "/" || req.url.startsWith("/?")) {
    fs.readFile(GAME_FILE, (err, data) => {
      if (err) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        return res.end("Game HTML file not found in repository root.");
      }
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache"
      });
      res.end(data);
    });
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const wss = new WebSocket.Server({ server, path: "/multiplayer" });

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}
function snapshot() {
  return [...players.values()].map(p => ({
    id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, rotation: p.rotation, hp: p.hp
  }));
}
function broadcast(payload, exceptId) {
  const message = JSON.stringify(payload);
  for (const p of players.values()) {
    if (p.id !== exceptId && p.ws.readyState === WebSocket.OPEN) p.ws.send(message);
  }
}
function safeName(value) {
  return String(value || "Player").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 18) || "Player";
}

wss.on("connection", (ws) => {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { type: "error", message: "Сервер заполнен." });
    return ws.close(1013, "Server full");
  }
  const id = crypto.randomUUID();
  const p = { id, ws, name: "Игрок", x: 0, y: 0, z: 7, rotation: 0, hp: 1000, lastUpdate: 0 };
  players.set(id, p);
  send(ws, { type: "welcome", id, players: snapshot() });
  broadcast({ type: "joined", player: { id, name: p.name, x: p.x, y: p.y, z: p.z, rotation: p.rotation, hp: p.hp } }, id);

  ws.on("message", raw => {
    if (raw.length > 2048) return;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "hello") {
      p.name = safeName(msg.name);
      broadcast({ type: "player", player: { id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, rotation: p.rotation, hp: p.hp } }, p.id);
      send(ws, { type: "welcome", id, players: snapshot() });
      return;
    }
    if (msg.type === "state") {
      const now = Date.now();
      if (now - p.lastUpdate < 40) return;
      p.lastUpdate = now;
      const x = Number(msg.x), z = Number(msg.z), rotation = Number(msg.rotation);
      if (![x, z, rotation].every(Number.isFinite)) return;
      // Keep clients within a reasonable shared arena.
      p.x = Math.max(-180, Math.min(180, x));
      p.z = Math.max(-180, Math.min(180, z));
      p.rotation = rotation;
      if (Number.isFinite(Number(msg.hp))) p.hp = Math.max(0, Math.min(1000, Number(msg.hp)));
      broadcast({ type: "player", player: { id: p.id, name: p.name, x: p.x, y: 0, z: p.z, rotation: p.rotation, hp: p.hp } }, p.id);
    }
  });
  ws.on("close", () => {
    players.delete(id);
    broadcast({ type: "left", id });
  });
  ws.on("error", () => {});
});

const heartbeat = setInterval(() => {
  for (const p of players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) send(p.ws, { type: "ping", online: players.size });
  }
}, 15000);
server.on("close", () => clearInterval(heartbeat));
server.listen(PORT, HOST, () => console.log(`Game server listening on ${HOST}:${PORT}`));
