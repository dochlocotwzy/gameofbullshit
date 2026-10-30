"use strict";
// Прогон настоящего server.js с подменой модуля ws (без сети): лобби -> база -> стены -> ворота -> новая партия.
const assert = require("node:assert/strict");
const Module = require("node:module"), { EventEmitter } = require("node:events");
class FakeServer extends EventEmitter { constructor() { super(); global.__wss = this; } }
const FakeWS = { Server: FakeServer, OPEN: 1 };
const origLoad = Module._load;
Module._load = function (req, ...a) { return req === "ws" ? FakeWS : origLoad.call(this, req, ...a); };
process.env.PORT = "18765";
const realLog = console.log; console.log = () => {};
require("../server.js");
console.log = realLog;

function client() {
  const ws = new EventEmitter(); ws.readyState = 1; ws.log = []; ws.send = d => ws.log.push(JSON.parse(d)); ws.close = () => {};
  global.__wss.emit("connection", ws);
  const api = { ws, say: m => ws.emit("message", Buffer.from(JSON.stringify(m))), last: t => [...ws.log].reverse().find(m => m.type === t), all: t => ws.log.filter(m => m.type === t), id: null };
  api.id = api.last("welcome").id; return api;
}
const A = client(), B = client(), C = client();
A.say({ type: "hello", name: "A" }); B.say({ type: "hello", name: "B" }); C.say({ type: "hello", name: "C" });
A.say({ type: "lobby-team", team: "blue" }); B.say({ type: "lobby-team", team: "red" }); C.say({ type: "lobby-team", team: "blue" });
B.say({ type: "lobby-ready", ready: true }); C.say({ type: "lobby-ready", ready: true });
assert.ok(A.last("siege-state"), "клиент получает siege-state при входе");
const posOf = (c, id) => (c.last("player") && 0, null);
A.say({ type: "lobby-start" }); assert.equal(A.last("lobby-state").phase, "playing", "матч стартовал");

// спавн по базам
const stA = A.last("lobby-state"), sg = A.last("siege-state");
const gate = sg.structures.find(s => s.id === "gate-blue"), hall = sg.structures.find(s => s.id === "hall-blue");
const mine = A.all("player").filter(m => m.player.id === A.id && Number.isFinite(m.player.x)).pop();
assert.ok(mine && mine.player.x < -40 && mine.player.x > -101, "синий игрок спавнится в своей базе слева");
const bme = B.all("player").filter(m => m.player.id === B.id && Number.isFinite(m.player.x)).pop();
assert.ok(bme && bme.player.x > 40, "красный игрок спавнится на базе справа");

// движение: идём к воротам, стена не пускает, закрытые ворота не пускают
let x = mine.player.x, z = mine.player.z;
const seen = () => C.all("player").filter(m => m.player.id === A.id && Number.isFinite(m.player.x)).pop().player;
const step = (tx, tz) => { A.say({ type: "state", x: tx, z: tz, rotation: 0 }); C.say({ type: "state", x: tx - 1.5, z: tz + 1.5, rotation: 0 }); return seen(); }; // C идёт рядом как наблюдатель (видимость ограничена)
for (let i = 0; i < 80; i++) { x = Math.min(x + 0.6, gate.x - 0.2); step(x, z); }
let me = seen();
assert.ok(me.x < gate.x0 - 0.3 && me.x > gate.x - 4, "закрытые ворота не пускают: x=" + me.x);
// прыжок сквозь стену (читерский пакет) отклоняется
const northWallZ = gate.z - 26;
A.say({ type: "state", x: me.x, z: northWallZ - 10, rotation: 0 });
const afterJump = seen();
assert.ok(afterJump.z > northWallZ, "телепорт через стену отклонён: z=" + afterJump.z);
// вернуть игрока к воротам (после читерского пакета он остался у северной стены), открыть, пройти
for (let i = 0; i < 12; i++) { z = Math.min(gate.z, z + 0); step(me.x, afterJump.z + (gate.z - afterJump.z) * (i + 1) / 12); }
z = gate.z;
A.say({ type: "siege-gate", id: "gate-blue", open: true });
assert.equal(A.last("siege-gate")?.open, true, "союзник открыл ворота");
for (let i = 0; i < 20; i++) { x += 0.6; step(x, z); }
me = seen();
assert.ok(me.x > gate.x1 + 0.3 || me.x > gate.x, "через открытые ворота можно пройти: x=" + me.x);
// враг далеко: не может ни открыть, ни ударить
B.say({ type: "siege-gate", id: "gate-blue", open: false });
assert.ok(B.last("siege-error"), "враг не управляет чужими воротами");
B.say({ type: "siege-attack", id: "gate-blue" });
assert.ok(B.all("siege-error").length >= 2, "слишком далеко для удара");

// новая партия: только хост
B.say({ type: "lobby-reset" }); assert.equal(B.last("lobby-state").phase, "playing", "не-хост не может сбросить");
A.say({ type: "lobby-reset" }); assert.equal(A.last("lobby-state").phase, "lobby", "хост вернул всех в лобби");
assert.equal(A.last("siege-state").structures.find(s => s.id === "gate-blue").open, false, "ворота закрыты после сброса");
console.log("Siege server integration OK"); process.exit(0);
