"use strict";
// Exercise economy messages through the real server message handler with two independent clients.
const assert = require("node:assert/strict");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

class FakeServer extends EventEmitter { constructor() { super(); global.__wss = this; } }
const FakeWS = { Server: FakeServer, OPEN: 1 };
const originalLoad = Module._load;
Module._load = function (request, ...args) { return request === "ws" ? FakeWS : originalLoad.call(this, request, ...args); };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "gob-economy-server-"));
process.env.GAME_DATA_DIR = dataDir;
process.env.PORT = "18766";
const originalLog = console.log;
console.log = () => {};
require("../server.js");
console.log = originalLog;

function client(name, token) {
  const ws = new EventEmitter();
  ws.readyState = 1;
  ws.log = [];
  ws.send = data => ws.log.push(JSON.parse(data));
  ws.close = () => {};
  global.__wss.emit("connection", ws);
  const api = {
    ws,
    say: message => ws.emit("message", Buffer.from(JSON.stringify(message))),
    last: type => [...ws.log].reverse().find(message => message.type === type),
    all: type => ws.log.filter(message => message.type === type),
    hello: () => api.say({ type: "hello", name, profileToken: token })
  };
  return api;
}

const profileToken = "merchant_profile_token_123456789";
const A = client("MerchantBuyer", profileToken);
const B = client("RemoteBuyer", "remote_profile_token_123456789");
A.hello();
B.hello();
A.say({ type: "lobby-team", team: "red" });
B.say({ type: "lobby-team", team: "blue" });
B.say({ type: "lobby-ready", ready: true });
A.say({ type: "lobby-start" });
assert.equal(A.last("lobby-state").phase, "playing", "two clients enter the same live match");

// The red client approaches the single neutral merchant on the east side of the river.
for (let step = 1; step <= 92; step++) A.say({ type: "state", x: 76.82 - step * 0.6, z: -16.1 + step * 0.175, rotation: 0 });
A.say({ type: "economy-merchant-open" });
assert.ok(A.last("economy-state").message.includes("нейтральному торговцу"), "merchant response: "+A.last("economy-state").message+"; player: "+JSON.stringify(A.last("player")?.player));
A.say({ type: "economy-blueprint-buy", weaponId: "broadsword", tier: "T1" });
let state = A.last("economy-state").economy;
assert.equal(state.items.gold, 65, "T1 blueprint costs 35 gold");
assert.equal(state.items["blueprint:broadsword:T1"], 1, "blueprint is stored as a single-use inventory item");

// A second player at their base cannot remotely access the merchant.
B.say({ type: "economy-blueprint-buy", weaponId: "broadsword", tier: "T1" });
assert.equal(B.last("economy-state").economy.items.gold, 100, "remote buyer cannot spend gold at the merchant");

// Buying materials is also range-checked and persisted with the profile token.
A.say({ type: "economy-trade", side: "buy", item: "wood", amount: 10 });
assert.equal(A.last("economy-state").economy.items.gold, 45);
assert.equal(A.last("economy-state").economy.items.wood, 10);
A.ws.emit("close");
const A2 = client("MerchantBuyer", profileToken);
A2.hello();
assert.equal(A2.last("economy-state").economy.items.gold, 45, "profile survives disconnect/reconnect");
assert.equal(A2.last("economy-state").economy.items["blueprint:broadsword:T1"], 1, "unconsumed blueprint survives reconnect");

// A round reset is global, including profiles whose owners are offline.
B.say({ type: "lobby-reset" });
A2.say({ type: "economy-get" });
assert.equal(A2.last("economy-state").economy.items.gold, 100, "round reset restores starting currency");
assert.equal(A2.last("economy-state").economy.items["blueprint:broadsword:T1"] || 0, 0, "round reset removes unused blueprints");

console.log("Economy server integration OK");
process.exit(0);
