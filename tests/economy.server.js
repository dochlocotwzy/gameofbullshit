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

// Both clients are still at their team bases: the server must reject remote merchant actions.
A.say({ type: "economy-merchant-open" });
assert.ok(A.last("economy-state").message.includes("Торговец слишком далеко"));
A.say({ type: "economy-blueprint-buy", weaponId: "broadsword", tier: "T1" });
assert.ok(A.last("economy-state").message.includes("только у нейтрального торговца"));
assert.equal(A.last("economy-state").economy.items.gold, 100, "remote blueprint purchase cannot spend gold");
B.say({ type: "economy-trade", side: "buy", item: "wood", amount: 10 });
assert.ok(B.last("economy-state").message.includes("рядом с нейтральным торговцем"));
assert.equal(B.last("economy-state").economy.items.gold, 100, "remote trade cannot spend gold");
B.say({ type: "economy-gear-sell", itemId: "not-owned" });
assert.ok(B.last("economy-state").message.includes("только нейтральному торговцу"));
assert.equal(B.last("economy-state").economy.items.gold, 100, "remote gear sale cannot create currency");
A.ws.emit("close");
const A2 = client("MerchantBuyer", profileToken);
A2.hello();
assert.equal(A2.last("economy-state").economy.items.gold, 100, "profile survives disconnect/reconnect");
assert.equal(A2.last("economy-state").economy.items["blueprint:broadsword:T1"] || 0, 0, "remote request did not create a blueprint");

// A round reset is global, including profiles whose owners are offline.
B.say({ type: "lobby-reset" });
A2.say({ type: "economy-get" });
assert.equal(A2.last("economy-state").economy.items.gold, 100, "round reset restores starting currency");
assert.equal(A2.last("economy-state").economy.items["blueprint:broadsword:T1"] || 0, 0, "round reset removes unused blueprints");

console.log("Economy server integration OK");
process.exit(0);
