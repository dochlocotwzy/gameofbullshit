"use strict";

const assert = require("node:assert/strict");
const { applyDurabilityLoss, resolveDeathGear, makeWorldDrop } = require("../game-data/loot-system");

const used = applyDurabilityLoss({ kind:"weapon", tier:"T2", durability:3, maxDurability:100 }, 4);
assert.equal(used.durability, 0);
const gear = {
  main_hand: { id:"w1", kind:"weapon", tier:"T1", durability:90, maxDurability:100 },
  chest: { id:"a1", kind:"armor", tier:"T5", durability:90, maxDurability:100 }
};
const resolved = resolveDeathGear(gear, () => 0.2);
assert.equal(resolved.dropped.length, 1);
assert.equal(resolved.broken.length, 1);
assert.equal(resolved.dropped[0].slot, "main_hand");
assert.equal(resolved.broken[0].slot, "chest");
const drop = makeWorldDrop(resolved.dropped[0], {x:4,z:8}, 1000);
assert.equal(drop.x, 4);
assert.equal(drop.item.id, "w1");
assert.equal(drop.expiresAt, 301000);
console.log("Loot system unit tests passed.");
