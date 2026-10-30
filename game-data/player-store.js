"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_ITEMS = Object.freeze({
  gold: 100,
  wood: 0, stone: 0, ore: 0, plank: 0, charcoal: 0,
  stone_block: 0, iron_ingot: 0, steel_ingot: 0,
  mithril_ingot: 0, adamantite_ingot: 0,
  tool_kit: 0, ship: 0
});

function validProfileToken(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{24,80}$/.test(value);
}

function createDefaultProfile() {
  return {
    version: 1,
    items: { ...DEFAULT_ITEMS },
    equipment: { main_hand: { id: "starter-broadsword", kind: "weapon", weaponId: "broadsword", tier: "T1", quality: "ordinary", durability: 100, maxDurability: 100 } },
    gear: [],
    craftJobs: [],
    factories: [],
    blueprints: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function createPlayerStore(options = {}) {
  const dataDir = options.dataDir || process.env.GAME_DATA_DIR || path.join(__dirname, "..", "data");
  const file = path.join(dataDir, "player-profiles.json");
  let profiles = {};
  let loaded = false;

  function load() {
    if (loaded) return;
    loaded = true;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed && parsed.version === 1 && parsed.profiles && typeof parsed.profiles === "object") profiles = parsed.profiles;
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error("Не удалось прочитать серверное хранилище игроков: " + error.message);
    }
  }

  function flush() {
    fs.mkdirSync(dataDir, { recursive: true });
    const temp = file + "." + process.pid + ".tmp";
    fs.writeFileSync(temp, JSON.stringify({ version: 1, profiles }), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temp, file);
  }

  function get(token) {
    if (!validProfileToken(token)) return null;
    load();
    if (!profiles[token]) {
      profiles[token] = createDefaultProfile();
      flush();
    }
    const value = profiles[token];
    return {
      version: 1,
      items: { ...DEFAULT_ITEMS, ...(value.items || {}) },
      equipment: value.equipment && typeof value.equipment === "object" ? { ...value.equipment } : { ...createDefaultProfile().equipment },
      gear: Array.isArray(value.gear) ? value.gear : [],
      craftJobs: Array.isArray(value.craftJobs) ? value.craftJobs : [],
      factories: Array.isArray(value.factories) ? value.factories : [],
      blueprints: { ...(value.blueprints || {}) },
      createdAt: value.createdAt || Date.now(),
      updatedAt: value.updatedAt || Date.now()
    };
  }

  function save(token, profile) {
    if (!validProfileToken(token)) return false;
    load();
    const safe = {
      version: 1,
      items: { ...DEFAULT_ITEMS, ...(profile?.items || {}) },
      equipment: { ...(profile?.equipment || {}) },
      gear: Array.isArray(profile?.gear) ? profile.gear : [],
      craftJobs: Array.isArray(profile?.craftJobs) ? profile.craftJobs : [],
      factories: Array.isArray(profile?.factories) ? profile.factories : [],
      blueprints: { ...(profile?.blueprints || {}) },
      createdAt: profiles[token]?.createdAt || profile?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    profiles[token] = safe;
    flush();
    return true;
  }

  function resetRound(token) {
    if (!validProfileToken(token)) return false;
    const current = get(token) || createDefaultProfile();
    current.items = { ...DEFAULT_ITEMS };
    current.equipment = { ...createDefaultProfile().equipment };
    current.gear = [];
    current.craftJobs = [];
    current.factories = [];
    current.blueprints = {};
    return save(token, current);
  }

  function resetAllProfiles() {
    load();
    for (const token of Object.keys(profiles)) profiles[token] = createDefaultProfile();
    flush();
    return Object.keys(profiles).length;
  }

  return { get, save, resetRound, resetAllProfiles, flush, get file() { return file; } };
}

module.exports = { createPlayerStore, validProfileToken, createDefaultProfile, DEFAULT_ITEMS };
