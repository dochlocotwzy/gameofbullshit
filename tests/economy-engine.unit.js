"use strict";

const assert = require("node:assert/strict");
const { craftWeapon, equipGear } = require("../game-data/economy-engine");

const profile = {
  items: { "blueprint:main_axe:T1": 1, wood: 20, ore: 20, plank: 20 },
  gear: [],
  equipment: { main_hand: { id: "starter-broadsword", kind: "weapon", weaponId: "broadsword", tier: "T1", durability: 100, maxDurability: 100 } }
};
const crafted = craftWeapon(profile, "main_axe", "T1", { random: () => 0, id: "crafted-axe-1" });
assert.equal(crafted.ok, true);
assert.equal(profile.items["blueprint:main_axe:T1"], 0);
assert.equal(profile.gear.length, 1);
assert.equal(crafted.item.quality, "ordinary");
const equipped = equipGear(profile, "crafted-axe-1");
assert.equal(equipped.ok, true);
assert.equal(profile.equipment.main_hand.weaponId, "main_axe");
assert.equal(profile.gear.length, 1);
assert.equal(profile.gear[0].id, "starter-broadsword");
const noBlueprint = craftWeapon(profile, "main_axe", "T1", { random: () => 0 });
assert.equal(noBlueprint.reason, "missing-blueprint");
console.log("Economy engine unit tests passed.");
