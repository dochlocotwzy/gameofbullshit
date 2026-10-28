/**
 * Data-first item catalog.
 * Balance values are prototype defaults; add item variants here instead of
 * spreading item identity and metadata through server handlers.
 */
const TIERS = Object.freeze({
  T1: { id: "T1", order: 1, powerMultiplier: 1.00 },
  T2: { id: "T2", order: 2, powerMultiplier: 1.08 },
  T3: { id: "T3", order: 3, powerMultiplier: 1.17 },
  T4: { id: "T4", order: 4, powerMultiplier: 1.28 },
  T5: { id: "T5", order: 5, powerMultiplier: 1.42 },
  T6: { id: "T6", order: 6, powerMultiplier: 1.60 },
  T7: { id: "T7", order: 7, powerMultiplier: 1.82 },
  T8: { id: "T8", order: 8, powerMultiplier: 2.10 }
});

const ITEM_DEFINITIONS = Object.freeze({
  wood: { id: "wood", name: "Древесина", category: "resource", tier: "T1", stackable: true, maxStack: 999, weight: 0.2, tradable: true },
  stone: { id: "stone", name: "Камень", category: "resource", tier: "T1", stackable: true, maxStack: 999, weight: 0.35, tradable: true },
  ore: { id: "ore", name: "Руда", category: "resource", tier: "T1", stackable: true, maxStack: 999, weight: 0.3, tradable: true },
  gold: { id: "gold", name: "Золото", category: "currency", tier: "T1", stackable: true, maxStack: 999999, weight: 0, tradable: false },
  charcoal: { id: "charcoal", name: "Древесный уголь", category: "refined_resource", tier: "T1", stackable: true, maxStack: 999, weight: 0.1, tradable: true },
  stone_block: { id: "stone_block", name: "Каменный блок", category: "refined_resource", tier: "T1", stackable: true, maxStack: 999, weight: 0.5, tradable: true },
  steel_ingot: { id: "steel_ingot", name: "Стальной слиток", category: "refined_resource", tier: "T2", stackable: true, maxStack: 999, weight: 0.35, tradable: true },
  tool_kit: { id: "tool_kit", name: "Набор инструментов", category: "crafted_good", tier: "T1", stackable: true, maxStack: 99, weight: 1.5, tradable: true },
  plank: { id: "plank", name: "Доски", category: "refined_resource", tier: "T1", stackable: true, maxStack: 999, weight: 0.25, tradable: true },
  iron_ingot: { id: "iron_ingot", name: "Железный слиток", category: "refined_resource", tier: "T1", stackable: true, maxStack: 999, weight: 0.3, tradable: true },
  sword: { id: "sword", name: "Меч", category: "weapon", tier: "T1", stackable: false, maxStack: 1, weight: 2.5, equipmentSlot: "main_hand", weaponFamily: "sword", tradable: true, statModifiers: { damageMultiplier: 1 } },
  ship: { id: "ship", name: "Корабль", category: "vehicle", tier: "T1", stackable: false, maxStack: 1, weight: 100, tradable: true }
});

// Weapon families are identifiers, not balance implementations. Each can later
// define its own abilities, mastery tracks, tier variants and stat modifiers.
const WEAPON_FAMILIES = Object.freeze({
  sword: { id: "sword", name: "Меч", equipmentSlot: "main_hand", abilitySet: "sword" },
  greatsword: { id: "greatsword", name: "Двуручный меч", equipmentSlot: "main_hand", abilitySet: "greatsword" },
  dual_swords: { id: "dual_swords", name: "Парные мечи", equipmentSlot: "main_hand", abilitySet: "dual_swords" },
  mace: { id: "mace", name: "Булава", equipmentSlot: "main_hand", abilitySet: "mace" },
  staff: { id: "staff", name: "Посох", equipmentSlot: "main_hand", abilitySet: "staff" },
  bow: { id: "bow", name: "Лук", equipmentSlot: "main_hand", abilitySet: "bow" },
  dagger: { id: "dagger", name: "Кинжал", equipmentSlot: "main_hand", abilitySet: "dagger" }
});

module.exports = { TIERS, ITEM_DEFINITIONS, WEAPON_FAMILIES };
