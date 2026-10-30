"use strict";

const crypto = require("crypto");
const { TIERS, CRAFT_QUALITY, rollCraftQuality, weaponRecipe } = require("./economy-config");

function makeWeaponInstance(weaponId, tierId, qualityId, id = crypto.randomUUID()) {
  const recipe = weaponRecipe(weaponId, tierId);
  const tier = TIERS[tierId], quality = CRAFT_QUALITY[qualityId];
  if (!recipe || !tier || !quality) return null;
  const maxDurability = Math.round(tier.durability * (quality.id === "outstanding" ? 1.08 : quality.id === "excellent" ? 1.04 : 1));
  return {
    id, kind: "weapon", itemId: recipe.id, weaponId, tier: tierId,
    quality: qualityId, powerMultiplier: Number((tier.power * quality.power).toFixed(3)),
    durability: maxDurability, maxDurability, slot: "main_hand"
  };
}

function canAfford(items, costs) {
  return Object.entries(costs || {}).every(([id, amount]) => Number(items?.[id] || 0) >= amount);
}

function craftWeapon(profile, weaponId, tierId, options = {}) {
  const recipe = weaponRecipe(weaponId, tierId);
  if (!recipe) return { ok: false, reason: "invalid-recipe" };
  const items = profile?.items || {};
  if (Number(items[recipe.blueprint] || 0) < 1) return { ok: false, reason: "missing-blueprint" };
  if (!canAfford(items, recipe.inputs)) return { ok: false, reason: "missing-materials" };
  for (const [id, amount] of Object.entries(recipe.inputs)) items[id] -= amount;
  items[recipe.blueprint] -= 1;
  const quality = rollCraftQuality(options.random || Math.random);
  const item = makeWeaponInstance(weaponId, tierId, quality, options.id);
  if (!Array.isArray(profile.gear)) profile.gear = [];
  profile.gear.push(item);
  return { ok: true, recipe, item };
}

function equipGear(profile, instanceId) {
  const gear = Array.isArray(profile?.gear) ? profile.gear : [];
  const index = gear.findIndex(item => item.id === instanceId);
  if (index < 0) return { ok: false, reason: "item-not-found" };
  const item = gear[index];
  if (item.kind !== "weapon" || item.slot !== "main_hand" || Number(item.durability) <= 0) return { ok: false, reason: "item-not-equipable" };
  if (!profile.equipment) profile.equipment = {};
  const previous = profile.equipment.main_hand;
  profile.equipment.main_hand = item;
  gear.splice(index, 1);
  if (previous && previous.id !== "starter-broadsword") gear.push(previous);
  return { ok: true, equipped: item, unequipped: previous || null };
}

module.exports = { makeWeaponInstance, canAfford, craftWeapon, equipGear };
