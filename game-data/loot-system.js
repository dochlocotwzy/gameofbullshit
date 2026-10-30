"use strict";

const { TIERS, rollConsumableDrop } = require("./economy-config");
const crypto = require("crypto");

function applyDurabilityLoss(item, amount = 1) {
  if (!item || item.kind !== "weapon" && item.kind !== "armor") return null;
  const max = Math.max(1, Number(item.maxDurability) || 1);
  const current = Math.max(0, Number(item.durability) || 0);
  return { ...item, maxDurability: max, durability: Math.max(0, current - Math.max(0, Number(amount) || 0)) };
}

function resolveDeathGear(equipment, random = Math.random) {
  const remaining = {};
  const dropped = [];
  const broken = [];
  for (const [slot, item] of Object.entries(equipment || {})) {
    if (!item || (item.kind !== "weapon" && item.kind !== "armor")) {
      remaining[slot] = item;
      continue;
    }
    const tier = TIERS[item.tier] || TIERS.T1;
    if ((Number(item.durability) || 0) <= 0 || random() < tier.breakOnDeath) {
      broken.push({ slot, item });
    } else {
      dropped.push({ slot, item });
    }
  }
  return { remaining, dropped, broken };
}

function makeWorldDrop(entry, position, now = Date.now()) {
  return {
    id: crypto.randomUUID(),
    slot: entry.slot,
    item: { ...entry.item },
    x: Number(position.x) || 0,
    z: Number(position.z) || 0,
    droppedAt: now,
    expiresAt: now + 5 * 60 * 1000
  };
}

function rollGatherConsumable(random = Math.random) {
  return rollConsumableDrop(random);
}

module.exports = { applyDurabilityLoss, resolveDeathGear, makeWorldDrop, rollGatherConsumable };
