"use strict";

const TIERS = Object.freeze({
  T1: { id: "T1", order: 1, label: "Простой", material: "wood", power: 1.00, durability: 100, breakOnDeath: 0.12 },
  T2: { id: "T2", order: 2, label: "Улучшенный", material: "iron_ingot", power: 1.10, durability: 125, breakOnDeath: 0.18 },
  T3: { id: "T3", order: 3, label: "Качественный", material: "steel_ingot", power: 1.22, durability: 155, breakOnDeath: 0.26 },
  T4: { id: "T4", order: 4, label: "Редкий", material: "mithril_ingot", power: 1.36, durability: 190, breakOnDeath: 0.36 },
  T5: { id: "T5", order: 5, label: "Эпический", material: "adamantite_ingot", power: 1.52, durability: 230, breakOnDeath: 0.48 }
});

const CRAFT_QUALITY = Object.freeze({
  ordinary: { id: "ordinary", label: "Обычное", power: 1.00, weight: 650 },
  good: { id: "good", label: "Хорошее", power: 1.03, weight: 230 },
  excellent: { id: "excellent", label: "Отличное", power: 1.07, weight: 95 },
  outstanding: { id: "outstanding", label: "Выдающееся", power: 1.12, weight: 25 }
});

const ITEM_RARITIES = Object.freeze({
  common: { id: "common", label: "Обычный", color: "#c5c5c5", weight: 800 },
  uncommon: { id: "uncommon", label: "Необычный", color: "#65bd79", weight: 150 },
  rare: { id: "rare", label: "Редкий", color: "#5c9ee8", weight: 42 },
  epic: { id: "epic", label: "Эпический", color: "#b47be8", weight: 8 }
});

const CONSUMABLE_DROPS = Object.freeze([
  { id: "minor_healing_potion", label: "Малое лечебное зелье", rarity: "common", chance: 0.045, stackable: true },
  { id: "minor_energy_potion", label: "Малое зелье энергии", rarity: "uncommon", chance: 0.018, stackable: true },
  { id: "battle_stew", label: "Походное рагу", rarity: "rare", chance: 0.006, stackable: true },
  { id: "greater_healing_potion", label: "Большое лечебное зелье", rarity: "epic", chance: 0.0015, stackable: true }
]);

const WEAPON_RECIPE_BASE = Object.freeze({
  wood: 8,
  ore: 6,
  plank: 4
});

function rollCraftQuality(random = Math.random) {
  const total = Object.values(CRAFT_QUALITY).reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  for (const item of Object.values(CRAFT_QUALITY)) {
    roll -= item.weight;
    if (roll < 0) return item.id;
  }
  return "ordinary";
}

function rollConsumableDrop(random = Math.random) {
  for (const item of CONSUMABLE_DROPS) if (random() < item.chance) return { ...item };
  return null;
}

function weaponRecipe(weaponId, tierId) {
  const tier = TIERS[tierId];
  if (!tier || !/^[a-z0-9_-]{2,64}$/i.test(String(weaponId || ""))) return null;
  const multiplier = tier.order;
  const material = tier.material;
  const inputs = { wood: 4 + multiplier * 2, plank: 2 + multiplier };
  inputs[material] = (inputs[material] || 0) + 3 + multiplier;
  return {
    id: `weapon:${weaponId}:${tierId}`,
    kind: "weapon",
    weaponId,
    tier: tierId,
    station: "forge",
    seconds: 12 + multiplier * 7,
    inputs,
    blueprint: `blueprint:${weaponId}:${tierId}`
  };
}

module.exports = { TIERS, CRAFT_QUALITY, ITEM_RARITIES, CONSUMABLE_DROPS, WEAPON_RECIPE_BASE, rollCraftQuality, rollConsumableDrop, weaponRecipe };
