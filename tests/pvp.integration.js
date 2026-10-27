const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const WebSocket = require("ws");

const port = 10187;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"]
});
const clients = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitUntil(fn, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await sleep(50);
  }
  throw new Error("Timed out waiting for server readiness");
}
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/multiplayer`);
    ws.messages = [];
    ws.on("message", raw => {
      try { ws.messages.push(JSON.parse(raw.toString())); } catch {}
    });
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
    clients.push(ws);
  });
}
async function waitMessage(ws, predicate, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = ws.messages.find(predicate);
    if (found) return found;
    await sleep(25);
  }
  throw new Error("Timed out waiting for expected WebSocket message");
}

(async () => {
  try {
    await waitUntil(async () => {
      try { return (await fetch(base + "/healthz")).status === 200; } catch { return false; }
    });
    const a = await connect();
    await waitMessage(a, m => m.type === "welcome");
    const b = await connect();
    const wa = await waitMessage(a, m => m.type === "welcome");
    const wb = await waitMessage(b, m => m.type === "welcome");
    const aId = wa.id;
    const bId = wb.id;
    assert.ok(aId && bId && aId !== bId, "server assigns distinct player IDs");

    a.send(JSON.stringify({ type: "ability-hit", targetId: bId, slot: "q", weapon: "broadsword", abilityId: "strike", aimX: 0, aimZ: 7 }));
    const hit = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId);
    assert.equal(hit.damage, 249, "server applies the configured ability damage");
    assert.equal(hit.hp, 751, "server owns the target's resulting HP");

    const status = await waitMessage(a, m => m.type === "combat-status" && m.targetId === aId && m.statuses?.haste);
    assert.equal(status.statuses.haste.value, 0.2, "attacker buff is applied to attacker, not target");
    assert.ok(status.statuses.haste.until > Date.now(), "attacker buff has a server expiry");
    const resource = await waitMessage(a, m => m.type === "combat-resource" && m.abilityId === "strike");
    assert.equal(resource.energy, 94, "server charges ability energy once");

    a.send(JSON.stringify({ type: "ability-hit", targetId: bId, slot: "q", weapon: "broadsword", abilityId: "strike", aimX: 0, aimZ: 7 }));
    const rejected = await waitMessage(a, m => m.type === "combat" && m.result === "cooldown" && m.abilityId === "strike");
    assert.ok(rejected.until > Date.now(), "server enforces ability cooldown");
    console.log("PvP integration OK: damage, status ownership, energy and cooldown");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    for (const ws of clients) try { ws.close(); } catch {}
    server.kill("SIGTERM");
    await sleep(150);
  }
})();
