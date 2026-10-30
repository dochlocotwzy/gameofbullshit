"use strict";
const assert = require("node:assert/strict");
const { createSiege } = require("../siege/siege-server");
let t = 1000; const players = new Map(), sent = [], bc = [];
const siege = createSiege({ players, send: (ws, m) => sent.push({ to: ws.id, m }), broadcast: m => bc.push(m), now: () => t, damageFor: () => 40 });
const mk = (id, team, x, z) => { const p = { id, team, x, z, hp: 100, ws: { id } }; players.set(id, p); return p; };
const gate = siege.structures.find(s => s.id === "gate-blue"), hall = siege.structures.find(s => s.id === "hall-blue");
const ally = mk("a", "blue", gate.x + 3, gate.z), enemy = mk("e", "red", gate.x + 3, gate.z);
const tick = ms => { t += ms; };

// ворота
assert.equal(siege.isSolid(gate.x, gate.z), true, "закрытые ворота непроходимы");
assert.equal(siege.setGate(enemy, "gate-blue", true), false, "враг не открывает ворота"); assert.equal(gate.open, false);
assert.equal(siege.setGate(ally, "gate-blue", true), true, "союзник открывает"); assert.equal(gate.open, true);
assert.equal(siege.isSolid(gate.x, gate.z), false, "открытые ворота проходимы");
ally.x = gate.x; tick(600); assert.equal(siege.setGate(ally, "gate-blue", false), false, "нельзя закрыть, пока в проходе стоят");
ally.x = gate.x + 3; tick(600); assert.equal(siege.setGate(ally, "gate-blue", false), true); assert.equal(gate.open, false);
assert.equal(siege.isSolid(0, 0), false, "середина карты свободна");
assert.equal(siege.isSolid(-71.3, gate.z - 26), true, "стена непроходима");
assert.equal(siege.isSolid(-71.3, gate.z), false, "двор свободен");

// урон по воротам
tick(1000); assert.equal(siege.attack(enemy, "gate-blue"), true); assert.equal(gate.hp, 9960);
assert.equal(siege.attack(enemy, "gate-blue"), false, "кулдаун"); assert.equal(gate.hp, 9960);
assert.equal(siege.attack(ally, "gate-blue"), false, "свои не бьют свои ворота");
enemy.x = gate.x + 40; tick(1000); assert.equal(siege.attack(enemy, "gate-blue"), false, "слишком далеко");
enemy.x = gate.x + 3;
gate.hp = 40; tick(1000); siege.attack(enemy, "gate-blue");
assert.equal(gate.hp, 0); assert.equal(gate.open, true, "разрушенные ворота открыты");
assert.ok(bc.some(m => m.type === "siege-destroyed"));
assert.equal(siege.setGate(ally, "gate-blue", false), false, "разрушенные нельзя закрыть"); assert.equal(siege.isSolid(gate.x, gate.z), false);

// ратуша и конец матча
enemy.x = hall.x + hall.r + 2; enemy.z = hall.z;
hall.hp = 40; tick(1000); siege.attack(enemy, "hall-blue");
assert.equal(hall.hp, 0); assert.deepEqual(siege.over && siege.over.winner, "red");
assert.equal(bc.filter(m => m.type === "siege-over").length, 1);

// после победы урон не проходит и повторного завершения нет
const other = siege.structures.find(s => s.id === "hall-red"); const redHp = other.hp;
const blue2 = mk("b", "blue", other.x - other.r - 2, other.z);
tick(1000); assert.equal(siege.attack(blue2, "hall-red"), false); assert.equal(other.hp, redHp);
assert.equal(bc.filter(m => m.type === "siege-over").length, 1, "матч завершается один раз");

// новая партия
siege.reset(); assert.equal(siege.over, null); assert.equal(hall.hp, hall.maxHp); assert.equal(gate.hp, 10000); assert.equal(gate.open, false);
console.log("Siege integration OK");
