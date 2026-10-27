const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";
const GAME_FILE = path.join(__dirname, "villagestrategy_albion_prototype (2).html");
const MAX_PLAYERS = 40;
const PLAYER_MAX_HP = 1000;
const WEAPON_DAMAGE = { broadsword: 40, claymore: 58, dual: 44, clarent: 42, carving: 54, galatine: 46, kingmaker: 60, infinity: 44 };
const ABILITY_MULTIPLIER = { q: 2.2, w: 2.8, e: 3.5 };
const ATTACK_RANGE = 3.8;
const ATTACK_COOLDOWN_MS = 850;
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
  const p = { id, ws, name: "Игрок", x: 0, y: 0, z: 7, rotation: 0, hp: PLAYER_MAX_HP, lastUpdate: 0, lastAttack: 0, lastAbility: 0, respawnTimer: null };
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
      if (p.hp <= 0) return; // Dead players cannot move until respawn.
      const now = Date.now();
      if (now - p.lastUpdate < 40) return;
      p.lastUpdate = now;
      const x = Number(msg.x), z = Number(msg.z), rotation = Number(msg.rotation);
      if (![x, z, rotation].every(Number.isFinite)) return;
      // Keep clients within a reasonable shared arena.
      p.x = Math.max(-180, Math.min(180, x));
      p.z = Math.max(-180, Math.min(180, z));
      p.rotation = rotation;
      // HP is server-authoritative; clients cannot set their own health.
      broadcast({ type: "player", player: { id: p.id, name: p.name, x: p.x, y: 0, z: p.z, rotation: p.rotation, hp: p.hp } }, p.id);
      return;
    }
    if (msg.type === "attack") {
      const now = Date.now();
      if (p.hp <= 0 || now - p.lastAttack < ATTACK_COOLDOWN_MS) return;
      const target = players.get(String(msg.targetId || ""));
      if (!target || target.id === p.id || target.hp <= 0) return;
      const distance = Math.hypot(target.x - p.x, target.z - p.z);
      if (!Number.isFinite(distance) || distance > ATTACK_RANGE) {
        send(ws, { type: "combat", result: "out-of-range", targetId: target.id });
        return;
      }
      const weapon = String(msg.weapon || "broadsword");
      const damage = WEAPON_DAMAGE[weapon] || WEAPON_DAMAGE.broadsword;
      p.lastAttack = now;
      target.hp = Math.max(0, target.hp - damage);
      broadcast({ type: "combat-hit", attackerId: p.id, targetId: target.id, damage, hp: target.hp, kind: "auto" });
      broadcast({ type: "player", player: { id: target.id, name: target.name, x: target.x, y: 0, z: target.z, rotation: target.rotation, hp: target.hp } });
      if (target.hp === 0 && !target.respawnTimer) {
        target.respawnTimer = setTimeout(() => {
          target.hp = PLAYER_MAX_HP;
          target.x = 0; target.z = 7;
          target.respawnTimer = null;
          broadcast({ type: "respawn", player: { id: target.id, name: target.name, x: target.x, y: 0, z: target.z, rotation: target.rotation, hp: target.hp } });
        }, 5000);
      }
      return;
    }
    if (msg.type === "ability-hit") {
      const now = Date.now();
      if (p.hp <= 0 || now - p.lastAbility < 500) return;
      const target = players.get(String(msg.targetId || ""));
      const slot = String(msg.slot || "q");
      const weapon = String(msg.weapon || "broadsword");
      if (!target || target.id === p.id || target.hp <= 0 || !ABILITY_MULTIPLIER[slot]) return;
      const distance = Math.hypot(target.x - p.x, target.z - p.z);
      const range = slot === "e" ? 6 : slot === "w" ? 4.5 : 4;
      if (!Number.isFinite(distance) || distance > range) { send(ws, { type: "combat", result: "out-of-range", targetId: target.id }); return; }
      const damage = Math.round((WEAPON_DAMAGE[weapon] || WEAPON_DAMAGE.broadsword) * ABILITY_MULTIPLIER[slot]);
      p.lastAbility = now;
      target.hp = Math.max(0, target.hp - damage);
      broadcast({ type: "combat-hit", attackerId: p.id, targetId: target.id, damage, hp: target.hp, kind: "ability", slot });
      broadcast({ type: "player", player: { id: target.id, name: target.name, x: target.x, y: 0, z: target.z, rotation: target.rotation, hp: target.hp } });
      if (target.hp === 0 && !target.respawnTimer) target.respawnTimer = setTimeout(() => {
        target.hp = PLAYER_MAX_HP; target.x = 0; target.z = 7; target.respawnTimer = null;
        broadcast({ type: "respawn", player: { id: target.id, name: target.name, x: target.x, y: 0, z: target.z, rotation: target.rotation, hp: target.hp } });
      }, 5000);
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
