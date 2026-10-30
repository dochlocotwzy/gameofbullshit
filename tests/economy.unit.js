"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPlayerStore, validProfileToken } = require("../game-data/player-store");
const { TIERS, CRAFT_QUALITY, rollCraftQuality, rollConsumableDrop, weaponRecipe } = require("../game-data/economy-config");

const token = "test_profile_token_1234567890";
assert.equal(validProfileToken(token), true);
assert.equal(validProfileToken("player-name"), false);
assert.deepEqual(Object.keys(TIERS), ["T1", "T2", "T3", "T4", "T5"]);
assert.ok(TIERS.T5.breakOnDeath > TIERS.T1.breakOnDeath);
assert.equal(rollCraftQuality(() => 0), "ordinary");
assert.equal(rollCraftQuality(() => 0.999999), "outstanding");
assert.equal(rollConsumableDrop(() => 0.999999), null);
assert.ok(rollConsumableDrop(() => 0)?.id);
assert.ok(weaponRecipe("main_axe", "T1").blueprint);
assert.equal(weaponRecipe("main_axe", "T6"), null);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gob-player-store-"));
try {
  const store = createPlayerStore({ dataDir: dir });
  const profile = store.get(token);
  profile.items.wood = 17;
  profile.equipment.main_hand = { id: "item-1", durability: 80 };
  profile.craftJobs = [{ id: "job-1", finishAt: 9999 }];
  assert.equal(store.save(token, profile), true);
  const reloaded = createPlayerStore({ dataDir: dir }).get(token);
  assert.equal(reloaded.items.wood, 17);
  assert.equal(reloaded.equipment.main_hand.durability, 80);
  assert.equal(reloaded.craftJobs[0].id, "job-1");
  const unarmedToken = "unarmed_profile_token_123456789";
  const unarmed = store.get(unarmedToken); unarmed.equipment = {}; store.save(unarmedToken, unarmed);
  assert.deepEqual(createPlayerStore({ dataDir: dir }).get(unarmedToken).equipment, {}, "death loss must not restore a free starter weapon on reconnect");
  const reset = createPlayerStore({ dataDir: dir });
  assert.equal(reset.resetRound(token), true);
  const afterReset = createPlayerStore({ dataDir: dir }).get(token);
  assert.equal(afterReset.items.wood, 0);
  assert.deepEqual(afterReset.craftJobs, []);
  const secondToken = "second_profile_token_123456789";
  const secondProfile = reset.get(secondToken); secondProfile.items.gold = 999; reset.save(secondToken, secondProfile);
  reset.resetAllProfiles();
  assert.equal(createPlayerStore({ dataDir: dir }).get(secondToken).items.gold, 100);
  assert.equal(afterReset.equipment.main_hand.weaponId, "broadsword");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log("Economy unit tests passed.");
