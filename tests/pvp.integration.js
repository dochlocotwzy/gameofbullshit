const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const WebSocket = require("ws");

const clientHtml = fs.readFileSync(path.join(__dirname, "..", "villagestrategy_albion_prototype (2).html"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const catalogSource = fs.readFileSync(path.join(__dirname, "..", "game-data", "catalog.js"), "utf8");
const weaponBranches = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "albion-weapon-branches.json"), "utf8"));
assert.deepEqual(Object.keys(weaponBranches.branches).sort(), ["axe", "mace"], "T8 weapon pack defines axe and mace branches");
for (const [branchId, branch] of Object.entries(weaponBranches.branches)) {
  assert.equal(branch.weapons.length, 8, `${branchId} branch has eight T8 weapons`);
  assert.ok(branch.weapons.every(weapon => weapon.id && weapon.nameRu && weapon.name && weapon.e), `${branchId} weapons have IDs, localized names and E abilities`);
  assert.ok(branch.q.length >= 1 && branch.w.length >= 1, `${branchId} branch has Q and W choices`);
  assert.equal(Object.keys(branch.passives).length, 4, `${branchId} branch defines four passives`);
  for (const [spellId, spell] of Object.entries(branch.spells)) {
    assert.equal(spell.id, spellId, `${branchId} spell key matches its stable ID`);
    assert.ok(["q", "w", "e"].includes(spell.slot), `${spellId} has a valid slot`);
    assert.ok(Number.isFinite(spell.cost) && spell.cost >= 0, `${spellId} has a non-negative energy cost`);
    assert.ok(Number.isFinite(spell.cooldown) && spell.cooldown >= 0, `${spellId} has a non-negative cooldown`);
    assert.ok(spell.shape && typeof spell.shape.type === "string", `${spellId} declares a hit shape`);
  }
}
assert.ok(fs.existsSync(path.join(__dirname, "..", "INTEGRATION.md")), "weapon integration guide is available at the repository root");

assert.ok(serverSource.includes('require("./game-data/catalog")'), "server inventory uses the shared item catalog");
assert.ok(catalogSource.includes("const TIERS = Object.freeze("), "item catalog defines extensible tiers");
assert.ok(catalogSource.includes("const ITEM_DEFINITIONS = Object.freeze("), "item catalog defines item metadata");
assert.ok(catalogSource.includes("const WEAPON_FAMILIES = Object.freeze("), "item catalog defines extensible weapon families");
assert.ok(catalogSource.includes("statModifiers"), "item metadata supports equipment stat modifiers");
assert.equal(Object.values(weaponBranches.branches).reduce((n, branch) => n + Object.keys(branch.spells).length, 0), 31, "weapon pack defines 31 spells across both branches");
assert.equal(Object.values(weaponBranches.branches).reduce((n, branch) => n + Object.keys(branch.passives).length, 0), 8, "weapon pack defines eight branch passives");
assert.ok(serverSource.includes("function absorbShield("), "server damage pipeline absorbs damage with shields");
assert.ok(serverSource.includes('e.type==="stackBleed"'), "server supports stacking axe bleed");
assert.ok(serverSource.includes('e.type==="moveBleed"'), "server supports movement-triggered bleed");
assert.ok(serverSource.includes('e.type==="healOverTime"'), "server supports healing-over-time effects");
assert.ok(serverSource.includes('e.type==="knockback"||e.type==="pull"'), "server resolves knockback and pull movement authoritatively");
assert.ok(serverSource.includes('require("./albion-weapon-branches.json")'), "server loads the shared T8 weapon data pack");
assert.ok(serverSource.includes("function handleAlbionAbility("), "server resolves data-driven axe and mace abilities");
assert.ok(serverSource.includes("weaponBranch!==ability.branch"), "server rejects abilities from a different weapon branch");
assert.ok(serverSource.includes("passive.everyNthAutoAttack"), "branch passives use their configured auto-attack cadence");
assert.ok(clientHtml.includes("const ALBION_PACK = "), "client embeds the weapon data for branch metadata");
assert.ok(clientHtml.includes("function configureBranchOptions("), "weapon changes rebuild Q/W/passive choices for the active branch");
assert.ok(clientHtml.includes("function buildWeaponModel("), "client renders axe and mace silhouettes instead of sword models");
assert.ok(clientHtml.includes("castAlbionDummySpell"), "new branch abilities have a generic local dummy-cast path");
assert.ok(serverSource.includes('const ALLOW_TEST_MODE = process.env.ALLOW_TEST_MODE === "true";'), "server free-cast mode is disabled unless explicitly enabled for tests");
assert.ok(serverSource.includes("const RESOURCE_RESPAWN_MS = 30 * 60 * 1000;"), "shared resources respawn after thirty minutes");
assert.ok(serverSource.includes("const RESOURCE_COUNTS = { wood: 124, stone: 48, ore: 24 };"), "server generates fixed, mirrored world counts for each resource type");
assert.ok(serverSource.includes("const leftX = -x;") && serverSource.includes("const rightX = x;"), "resource nodes are generated in mirrored pairs across the map");
assert.ok(!clientHtml.includes("createLocalResourceFallback();"), "client never creates an independent resource world");
assert.ok(clientHtml.includes("const wasDepleted = !!r.depleted;"), "resource visuals distinguish respawn transitions from repeated snapshots");
assert.ok(clientHtml.includes("if (wasDepleted) {"), "resource growth animation starts only when a depleted node respawns");
assert.ok(!clientHtml.includes("const lowGeos = [buildPineLow()"), "decorative non-harvestable background trees are not generated");
assert.ok(clientHtml.includes("Replace the old bright, almost uniform green carpet with a layered medieval field palette."), "ground texture uses layered natural terrain detail");
assert.ok(clientHtml.includes("Replace the old bright, almost uniform green carpet"), "ground texture uses a redesigned medieval field palette");
assert.ok(clientHtml.includes("Broad, irregular ground cover patches"), "ground texture includes clearly visible large-scale color variation");
assert.ok(serverSource.includes('ship: { name: "Корабль", inputs: { plank: 20, iron_ingot: 4 }, output: { ship: 1 }, seconds: 45, station: "shipyard" }'), "ship construction consumes refined materials at a shipyard");
assert.ok(serverSource.includes('shipyard: { name: "Верфь", cost: { wood: 20, stone: 12, plank: 8 }, recipe: "ship" }'), "shipyard has a server-validated construction cost");
assert.ok(clientHtml.includes("addPortDock(-49, -1); addPortDock(49, 1)"), "map has docks at both river mouths");
assert.ok(clientHtml.includes("addPrototypeBoat(1.5, -42.5, 0)"), "map includes prototype ship visuals");
assert.ok(clientHtml.includes("{id:'shipyard',name:'Верфь'") && clientHtml.includes("{id:'ship',name:'Корабль'"), "economy UI exposes shipyard construction and ship production");
assert.ok(serverSource.includes("Math.hypot(p.x - node.x, p.z - node.z) > 3.6"), "resource gathering validates server-side proximity");
assert.ok(serverSource.includes("closestRiverPoint(leftX, z).distance < 5.5") && serverSource.includes("closestRiverPoint(rightX, z).distance < 5.5"), "server resource generation excludes the river and its banks on both mirrored sides");
assert.ok(serverSource.includes("function isRiverBlocked(x, z)"), "server blocks player positions inside the river");
assert.ok(serverSource.includes("function safeLandPosition(fromX, fromZ, toX, toZ)"), "server dash movement cannot cross the river outside bridge corridors");
assert.ok(serverSource.includes("const candidate = { x: Math.round((-31 + Math.cos(angle)*radius) * MAP_SCALE * 100) / 100, z: Math.round((-7 + Math.sin(angle)*radius) * MAP_SCALE * 100) / 100 };"), "player spawn and respawn positions are assigned around the left village");
assert.ok(serverSource.includes("return isRiverBlocked(candidate.x, candidate.z) ? safeLandPosition(-31*MAP_SCALE, -7*MAP_SCALE, candidate.x, candidate.z) : candidate;"), "left-village spawn and respawn positions are kept on dry land");
assert.ok(serverSource.includes("accepted = safeLandPosition(p.x, p.z, accepted.x, accepted.z)"), "server clamps river entry to last valid land point instead of snapping to old position");
assert.ok(clientHtml.includes("style:base.style||w.id") && clientHtml.includes("function buildWeaponModel(look)"), "weapon families have data-driven visual identities and custom meshes");
assert.ok(clientHtml.includes("function isRiverBlocked(x, z)"), "client collision system treats the river as an obstacle");
assert.ok(!clientHtml.includes("createLocalResourceFallback();"), "resource nodes remain server-authoritative");
assert.ok(clientHtml.includes("const RIVER_BLOCK_RADIUS = 3.15 * MAP_SCALE;"), "client river collision leaves a narrow, consistent bank margin");
assert.ok(clientHtml.includes("Math.abs(x - bx) <= 4.15 && Math.abs(z - bz) <= 2.15"), "bridge collision matches the visible bridge deck footprint");
assert.ok(clientHtml.includes("only the three bridge decks permit crossing"), "client movement collision preserves the three bridge crossings");
assert.ok(serverSource.includes("const MAP_SCALE = 2.3;") && clientHtml.includes("const MAP_SCALE = 2.3;"), "server and client use the same expanded map scale");
assert.ok(serverSource.includes("function chooseTeam()") && serverSource.includes("team===p.team"), "server assigns balanced teams and prevents friendly fire");
assert.ok(serverSource.includes("target.team===p.team") && serverSource.includes("t.team===p.team"), "targeted and cone PvP abilities reject teammates");
assert.ok(serverSource.includes("factories:worldFactories.map(publicFactory)") && clientHtml.includes("if (Array.isArray(msg.factories)) syncFactoryWorld(msg.factories)"), "reconnect welcome messages preserve the shared factory world");
assert.ok(clientHtml.includes("remote.team === window.mpTeam") && clientHtml.includes("Это союзник"), "client target selection avoids teammates");
assert.ok(clientHtml.includes("ownedMaterials:[bodyMat,roof.material,cloth.material]") && clientHtml.includes("for(const material of entry.ownedMaterials||[])material.dispose()"), "factory removal does not dispose shared map materials");
assert.ok(serverSource.includes("function factoryPlacementClear") && clientHtml.includes("function syncFactoryVisual"), "factory placement has server validation and shared world visuals");
assert.ok(serverSource.includes("economy-open-factory") && serverSource.includes("p.activeFactoryId!==factory.id"), "factory production requires an opened nearby factory menu");
assert.ok(serverSource.includes("startFactoryJob(p, activeFactory)") && !serverSource.includes("takeItems(p.economy.items, recipe.inputs); addItems(p.economy.items, recipe.output);"), "refining runs as timed factory production instead of instant crafting");
assert.ok(serverSource.includes("worldResources.some(node => !node.depleted") && serverSource.includes("factory-damage"), "factory placement avoids live resource nodes and enemy factories can be damaged");
assert.ok(!serverSource.includes('sword: { name: "Меч", inputs:') && !clientHtml.includes('sword:["⚔️","Мечи"]'), "sword crafting and sword inventory display are disabled in the economy prototype");
assert.ok(serverSource.includes('type: "resource-node"'), "resource depletion and respawn are broadcast");
assert.ok(serverSource.includes("const visible = isInVision(viewer, node.x, node.z);") && serverSource.includes("node: visible ? fullNode : {") && serverSource.includes("respawnAt: node.respawnAt"), "resource state updates reveal coordinates only inside player vision");
assert.ok(clientHtml.includes("msg.type === 'world-vision'") && clientHtml.includes("syncResourceWorld(Array.isArray(msg.resources) ? msg.resources : [])"), "client refreshes resource nodes when server vision changes, including empty snapshots");
assert.ok(clientHtml.includes("Keep still-visible server nodes alive so gather orders and mesh references remain stable"), "resource vision reconciliation preserves visible node identity instead of rebuilding all nodes each update");
assert.ok(clientHtml.includes("if (!r.serverManaged) { if (window.mpToast) window.mpToast('Жду синхронизации ресурсов с сервером.'); return; }"), "client cannot gather locally generated fallback resources while online");
assert.ok(clientHtml.includes("nodeId:r.id"), "client sends the selected resource node ID");
assert.ok(clientHtml.includes("syncResourceWorld(msg.resources)"), "client renders the shared resource layout");
assert.ok(clientHtml.includes("if (!window.mpTargetId && window.mpSelectNearestTarget) window.mpSelectNearestTarget(); if (window.mpTargetId) window.mpStartChase();"), "Space selects a nearby opponent before starting chase");
assert.ok(serverSource.includes("const travel=Math.min(maxTravel,len);") && !serverSource.includes("if(len>maxTravel+1)return;"), "PvP dash AoE clamps distant cursor aim instead of silently rejecting the cast");
assert.ok(clientHtml.includes("if (p.id === mpId)") && clientHtml.includes("setPlayerHealth(Number(p.hp))"), "client applies server HP corrections to the local player");
assert.ok(clientHtml.includes("(buffs.blood.t > 0 ? .3 : 0)"), "local dummy autoattacks include Bloodthirsty damage bonus");
assert.ok(clientHtml.includes("if (!options.multiplayerCast && !TEST.free) { energy -= sp.en; cd[slot] = sp.cd; }"), "multiplayer casts do not spend energy or start cooldown locally");
assert.ok(clientHtml.includes("Do not trust local cooldown/energy mirrors in PvP."), "PvP cooldown and energy acceptance are server-authoritative");
assert.ok(clientHtml.includes("msg.abilityId !== 'splitting' && (msg.phase !== 'cast' || msg.attackerId === mpId)"), "Splitting Slash renders as a line rather than an endpoint damage circle");
assert.ok(clientHtml.includes("const expiresAt = Number(msg.chargeExpiresAt);"), "client uses the server charge expiry timestamp");
assert.ok(serverSource.includes("combat-windup"), "server broadcasts the start of the auto-attack windup");
assert.ok(serverSource.includes('const ECONOMY_RECIPES ='), "server defines validated crafting recipes");
assert.ok(serverSource.includes('if (msg.type === "economy-gather")'), "resource gathering is handled by the server");
assert.ok(serverSource.includes('if (msg.type === "economy-build")'), "factory construction is handled by the server");
assert.ok(serverSource.includes('if (msg.type === "economy-run")'), "factory production is started by the server");
assert.ok(serverSource.includes("startFactoryJob(p, factory)"), "factories chain production while inputs remain");
assert.ok(serverSource.includes("recipe.station"), "manual crafting requires the matching production station");
assert.ok(clientHtml.includes('id="economy-panel"'), "client exposes the inventory and production UI");
assert.ok(clientHtml.includes('data-econ-tab="items"'), "economy UI separates inventory into compact tabs");
assert.ok(clientHtml.includes("ev.code==='KeyI'"), "inventory can be toggled with I");
assert.ok(clientHtml.includes("e.code==='KeyF'"), "F invokes contextual resource interaction");
assert.ok(clientHtml.includes(".filter(v=>v.d<=1.6)"), "F requires close interaction range");
assert.ok(clientHtml.includes(".sort((a,b)=>a.d-b.d||a.index-b.index)[0]"), "F chooses the nearest eligible resource deterministically");
assert.ok(clientHtml.includes("sp.target === 'enemy' && !groundAoE.has(String(abilityId))"), "multiplayer AoE abilities do not require a selected enemy target");
assert.ok(clientHtml.includes("sp.target === 'ground' || groundAoE.has(String(abilityId))"), "multiplayer AoE casts face their ground aim point");
assert.ok(clientHtml.includes("float coastLimit = 0.90"), "world ground is clipped to an irregular island shoreline");
assert.ok(clientHtml.includes("const riverCenter = [[0,-55]"), "world map includes a central winding river");
assert.ok(clientHtml.includes("addRiverBridge(0, -28)") && clientHtml.includes("addRiverBridge(0, 28)"), "river prototype includes two visible crossings");
assert.ok(clientHtml.includes("makeHouse(-13, -37") && clientHtml.includes("makeHouse(37, -7") && clientHtml.includes("makeHouse(-13, 37"), "village buildings are distributed across distinct island regions");
assert.ok(clientHtml.includes("[[0, -8], [0, -20], [0, -28], [-5, -34], [-13, -37]]") && clientHtml.includes("[[0, 0], [-7, 0], [-18, -2], [-27, -5], [-37, -7]]"), "road network connects outer villages to river crossings and central hub");
assert.ok(clientHtml.includes("addRiverBridge(-7, 0)"), "central river route has a crossing near the hub");
assert.ok(clientHtml.includes("color: 0x1b5977"), "island is surrounded by ocean rather than an outer grass plane");
assert.ok(clientHtml.includes("window.mpClearTarget(true);"), "Escape clears the selected PvP target");
assert.ok(clientHtml.includes("if (econPanel.classList.contains('open')) return;"), "Escape closes an open inventory panel before clearing the target");
assert.ok(clientHtml.includes("if (order.mode === 'mp-chase') window.mpStopMovement?.();"), "Escape stops server movement when cancelling target chase");
assert.ok(clientHtml.includes("data-econ=\"build\""), "client can request factory construction");
assert.ok(clientHtml.includes("data-econ=\"craft\""), "client can request crafting");
assert.ok(serverSource.includes("combat-cancelled"), "server cancels auto-attacks interrupted before impact");
assert.ok(clientHtml.includes("window.mpStartChase"), "Space can start chasing the selected multiplayer target");
assert.ok(clientHtml.includes("order.mode === 'mp-chase'"), "selected-target chasing follows the target's current position");
assert.ok(clientHtml.includes("msg.type === 'combat-windup'"), "client starts the attack animation from the server windup event");

const port = 10187;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", ALLOW_TEST_MODE: "true" },
  stdio: ["ignore", "pipe", "pipe"]
});
const clients = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitUntil(fn, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await sleep(50);
  }
  throw new Error("Timed out waiting for server readiness");
}
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/multiplayer`);
    ws.messages = [];
    ws.on("message", raw => {
      try { ws.messages.push(JSON.parse(raw.toString())); } catch {}
    });
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
    clients.push(ws);
  });
}
async function waitMessage(ws, predicate, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = ws.messages.find(predicate);
    if (found) return found;
    await sleep(25);
  }
  throw new Error("Timed out waiting for expected WebSocket message");
}

(async () => {
  try {
    await waitUntil(async () => {
      try { return (await fetch(base + "/healthz")).status === 200; } catch { return false; }
    });
    const a = await connect();
    await waitMessage(a, m => m.type === "welcome");
    const b = await connect();
    const wa = await waitMessage(a, m => m.type === "welcome");
    const wb = await waitMessage(b, m => m.type === "welcome");
    const aId = wa.id;
    const bId = wb.id;
    assert.ok(aId && bId && aId !== bId, "server assigns distinct player IDs");
    assert.ok(Array.isArray(wa.resources) && wa.resources.length > 0 && wa.resources.length <= 98, "server sends only resource nodes currently inside the player's vision");
    assert.ok(Array.isArray(wb.resources) && wb.resources.length <= 98, "each player receives their own vision-filtered resource set");
    assert.ok(serverSource.includes("const RESOURCE_COUNTS = { wood: 124, stone: 48, ore: 24 };"), "server owns the full 196-node world regardless of each client's visible subset");
    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({type:"economy-get"}));
    const initialEconomy = await waitMessage(a, m => m.type === "economy-state");
    assert.equal(initialEconomy.economy.items.wood, 0);
    a.send(JSON.stringify({type:"economy-gather",resource:"wood"}));
    const rejectedGather = await waitMessage(a, m => m.type === "economy-state" && m.action === "gather");
    assert.equal(rejectedGather.ok, false, "server rejects gathering without a valid nearby node ID");
    const resourceNode = wa.resources.find(n => n.kind === "wood") || wa.resources[0];
    assert.ok(resourceNode, "at least one resource node is available inside initial vision");
    const resourceYield = resourceNode.kind === "wood" ? 3 : 2;
    // Move the second player into the same visible area so the depletion broadcast can be verified without leaking hidden nodes.
    b.send(JSON.stringify({type:"state",x:resourceNode.x,z:resourceNode.z,rotation:0}));
    await waitMessage(a, m => m.type === "player" && m.player?.id === bId);
    a.send(JSON.stringify({type:"state",x:resourceNode.x,z:resourceNode.z,rotation:0}));
    a.send(JSON.stringify({type:"economy-gather",resource:resourceNode.kind,nodeId:resourceNode.id,requestId:"resource-test-1"}));
    const gatheredEconomy = await waitMessage(a, m => m.type === "economy-state" && m.action === "gather" && m.ok === true);
    assert.equal(gatheredEconomy.economy.items[resourceNode.kind], resourceYield, "server awards the configured yield for the selected resource type");
    const depletedNode = await waitMessage(b, m => m.type === "resource-node" && m.node?.id === resourceNode.id && m.node.depleted === true);
    assert.ok(depletedNode.node.respawnAt >= Date.now() + 29 * 60 * 1000, "shared node receives a thirty-minute server respawn deadline");
    assert.equal(gatheredEconomy.nodeId, resourceNode.id, "gather confirmation identifies the depleted node");
    // The server must serialize competing requests: the second player cannot collect the same node.
    b.send(JSON.stringify({type:"economy-gather",resource:resourceNode.kind,nodeId:resourceNode.id,requestId:"resource-test-contended"}));
    const contendedGather = await waitMessage(b, m => m.type === "economy-state" && m.action === "gather" && m.requestId === "resource-test-contended");
    assert.equal(contendedGather.ok, false, "a depleted node cannot be harvested by a competing client");
    assert.equal(contendedGather.economy.items[resourceNode.kind] || 0, 0, "a rejected competing gather grants no resources");
    a.send(JSON.stringify({type:"economy-craft",recipe:"sword"}));
    const rejectedCraft = await waitMessage(a, m => m.type === "economy-state" && m.message.includes("отключён"));
    assert.equal("sword" in rejectedCraft.economy.items, false, "swords are not part of the prototype economy inventory");
    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({ type: "attack", targetId: bId }));
    await waitMessage(b, m => m.type === "combat-windup" && m.attackerId === aId);
    a.send(JSON.stringify({ type: "state", x: -5, z: 5, rotation: 0 }));
    await waitMessage(b, m => m.type === "combat-cancelled" && m.attackerId === aId);
    await sleep(400);
    assert.equal(b.messages.some(m => m.type === "combat-hit" && m.attackerId === aId && m.kind === "auto"), false);
    a.send(JSON.stringify({ type: "state", x: -1.4, z: 7, rotation: 0 }));
    b.send(JSON.stringify({ type: "state", x: 1.4, z: 7, rotation: Math.PI }));
    await sleep(100);
    a.send(JSON.stringify({ type: "loadout", q: "strike", w: "hamstring" }));

    a.send(JSON.stringify({ type: "ability-hit", targetId: bId, slot: "q", weapon: "broadsword", abilityId: "strike", aimX: 0, aimZ: 7 }));
    const hit = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId);
    assert.equal(hit.damage, 249, "server applies the configured ability damage");
    assert.equal(hit.hp, 751, "server owns the target's resulting HP");

    const status = await waitMessage(a, m => m.type === "combat-status" && m.targetId === aId && m.statuses?.haste);
    assert.equal(status.statuses.haste.value, 0.2, "attacker buff is applied to attacker, not target");
    assert.ok(status.statuses.haste.until > Date.now(), "attacker buff has a server expiry");
    const resource = await waitMessage(a, m => m.type === "combat-resource" && m.abilityId === "strike");
    assert.equal(resource.energy, 94, "server charges ability energy once");

    await sleep(300);
    a.send(JSON.stringify({ type: "ability-hit", targetId: bId, slot: "q", weapon: "broadsword", abilityId: "strike", aimX: 0, aimZ: 7 }));
    const rejected = await waitMessage(a, m => m.type === "combat" && m.result === "cooldown" && m.abilityId === "strike");
    assert.ok(rejected.until > Date.now(), "server enforces ability cooldown");

    const hitsBeforeInvalidSlot = b.messages.filter(m => m.type === "combat-hit" && m.attackerId === aId).length;
    a.send(JSON.stringify({ type: "ability-hit", targetId: bId, slot: "q", weapon: "kingmaker", abilityId: "hamstring", aimX: 0, aimZ: 7 }));
    await sleep(350);
    assert.equal(b.messages.filter(m => m.type === "combat-hit" && m.attackerId === aId).length, hitsBeforeInvalidSlot, "server rejects a mismatched ability slot and ignores client weapon claims");

    a.send(JSON.stringify({ type: "ability-hit", targetId: bId, slot: "w", weapon: "broadsword", abilityId: "hamstring", aimX: 0, aimZ: 7 }));
    const debuffHit = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.abilityId === "hamstring");
    assert.equal(debuffHit.damage, 192, "server applies the selected ability's damage");
    const debuff = await waitMessage(b, m => m.type === "combat-status" && m.targetId === bId && m.statuses?.slow);
    assert.equal(debuff.statuses.slow.value, 0.38, "target debuff is applied to the target");
    assert.ok(debuff.statuses.slow.until > Date.now(), "target debuff has a server expiry");

    await sleep(300);
    a.send(JSON.stringify({ type: "ability-hit", targetId: bId, slot: "e", weapon: "broadsword", abilityId: "mightyBlow", aimX: 0, aimZ: 7 }));
    const selfBuff = await waitMessage(a, m => m.type === "combat-status" && m.targetId === aId && m.statuses?.resist);
    assert.equal(selfBuff.statuses.resist.value, 0.7, "self-defense buff is applied to the caster");
    await sleep(3300);
    const expired = await waitMessage(a, m => m.type === "combat-status" && m.targetId === aId && !m.statuses?.resist);
    assert.ok(expired, "expired status is removed and broadcast to clients");
    // Regression: Spinning clamps a cursor aim far beyond its 12m travel limit,
    // rather than silently rejecting the cast.
    a.send(JSON.stringify({ type: "weapon", weapon: "dual" }));
    a.send(JSON.stringify({ type: "state", x: 0, z: 0, rotation: 0 }));
    b.send(JSON.stringify({ type: "state", x: 3.1, z: 12, rotation: 0 }));
    await sleep(100);
    a.send(JSON.stringify({ type: "ability-hit", targetId: "", slot: "e", weapon: "dual", abilityId: "spinning", aimX: 0, aimZ: 20 }));
    const spinningHit = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.abilityId === "spinning");
    assert.equal(spinningHit.damage, 500, "Spinning clamps distant cursor aim to the 12m landing point and still hits");

    // Regression: Interrupt scales auto-attack damage with the Heroic Charges held at cast time.
    await waitMessage(b, m => m.type === "respawn" && m.player?.id === bId, 7000);

    // Regression: Majestic's delayed second hit must re-check the original 6m circle.
    a.send(JSON.stringify({ type: "test-mode", enabled: true }));
    a.send(JSON.stringify({ type: "weapon", weapon: "kingmaker" }));
    a.send(JSON.stringify({ type: "state", x: 0, z: 0, rotation: 0 }));
    b.send(JSON.stringify({ type: "state", x: 0, z: 5, rotation: 0 }));
    await waitMessage(a, m => m.type === "player" && m.player?.id === bId && m.player?.z === 5);
    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({ type: "ability-hit", targetId: "", slot: "e", abilityId: "majestic", aimX: 0, aimZ: 0 }));
    const majesticFirst = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.abilityId === "majestic" && m.hitIndex === 0);
    assert.equal(majesticFirst.damage, 330, "Majestic first impact uses configured damage");
    b.send(JSON.stringify({ type: "state", x: 0, z: 12, rotation: 0 }));
    await waitMessage(a, m => m.type === "player" && m.player?.id === bId && m.player?.z === 12);
    await sleep(1050);
    assert.equal(b.messages.filter(m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.abilityId === "majestic" && m.hitIndex === 1).length, 0, "Majestic second impact misses a target that left the cast circle");

    // Return to the circle and finish the target so later tests start with full HP after respawn.
    b.send(JSON.stringify({ type: "state", x: 0, z: 5, rotation: 0 }));
    await waitMessage(a, m => m.type === "player" && m.player?.id === bId && m.player?.z === 5);
    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({ type: "ability-hit", targetId: "", slot: "e", abilityId: "majestic", aimX: 0, aimZ: 0 }));
    const majesticKill = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.abilityId === "majestic" && m.hitIndex === 1 && m.hp === 0, 3000);
    assert.equal(majesticKill.damage, 480, "Majestic second impact still lands when the target remains in range");
    const majesticSecondFx = await waitMessage(b, m => m.type === "combat-effect" && m.phase === "impact" && m.abilityId === "majestic" && m.hitIndex === 1 && m.targetIds?.includes(bId), 2000);
    assert.ok(majesticSecondFx, "Majestic second hit broadcasts its own impact visual");
    await waitMessage(b, m => m.type === "respawn" && m.player?.id === bId, 7000);

    // Regression: Splitting Slash damages and roots targets anywhere along the full line,
    // even if the cursor point used to choose direction is much closer than the target.
    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({ type: "test-mode", enabled: true }));
    a.send(JSON.stringify({ type: "loadout", q: "strike", w: "splitting", p: "deepcuts" }));
    a.send(JSON.stringify({ type: "state", x: 0, z: 0, rotation: 0 }));
    b.send(JSON.stringify({ type: "state", x: 0, z: 10, rotation: 0 }));
    await waitMessage(a, m => m.type === "player" && m.player?.id === bId && m.player?.z === 10);
    a.send(JSON.stringify({ type: "ability-hit", targetId: "", slot: "w", abilityId: "splitting", aimX: 0, aimZ: 2 }));
    const splittingHit = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.abilityId === "splitting", 2000);
    assert.equal(splittingHit.damage, 432, "Splitting Slash damages targets across the full 14m line");
    const splittingRoot = await waitMessage(b, m => m.type === "combat-status" && m.targetId === bId && m.statuses?.root, 2000);
    assert.ok(splittingRoot.statuses.root.until > Date.now(), "Splitting Slash roots every target hit by its line");
    const splittingFx = await waitMessage(b, m => m.type === "combat-effect" && m.abilityId === "splitting", 2000);
    assert.ok(Math.abs(splittingFx.aimZ - 14) < .1, "Splitting Slash visual line extends to its full 14m range");
    await waitMessage(b, m => m.type === "combat-status" && m.targetId === bId && !m.statuses?.root, 3000);
    await waitMessage(b, m => m.type === "respawn" && m.player?.id === bId, 7000);

    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({ type: "test-mode", enabled: true }));
    a.send(JSON.stringify({ type: "loadout", q: "strike", w: "interrupt", p: "deepcuts" }));
    a.send(JSON.stringify({ type: "weapon", weapon: "broadsword" }));
    a.send(JSON.stringify({ type: "state", x: 0, z: 4, rotation: 0 }));
    b.send(JSON.stringify({ type: "state", x: 0, z: 7, rotation: 0 }));
    await sleep(100);
    for (let charges = 1; charges <= 3; charges++) {
      a.messages.length = 0; b.messages.length = 0;
      a.send(JSON.stringify({ type: "ability-hit", targetId: bId, slot: "q", weapon: "broadsword", abilityId: "strike", aimX: 0, aimZ: 7 }));
      const strikeHit = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.abilityId === "strike");
      assert.equal(strikeHit.damage, 249, "Strike remains server-authoritative while generating a charge");
      const chargeResource = await waitMessage(a, m => m.type === "combat-resource" && m.abilityId === "strike" && m.charges === charges);
      assert.ok(chargeResource.chargeExpiresAt > Date.now() && chargeResource.chargeExpiresAt <= Date.now() + 6000, "server sends absolute charge expiry");
      if (charges < 3) await sleep(300);
    }
    await sleep(300);
    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({ type: "ability-hit", targetId: bId, slot: "w", weapon: "broadsword", abilityId: "interrupt", aimX: 0, aimZ: 7 }));
    const interruptBuff = await waitMessage(a, m => m.type === "combat-status" && m.targetId === aId && m.statuses?.interruptAttackBuff);
    assert.equal(interruptBuff.statuses.interruptAttackBuff.value, 0.6, "three charges grant a 60% Interrupt auto-attack bonus");
    assert.ok(interruptBuff.statuses.interruptAttackBuff.until > Date.now(), "scaled Interrupt buff has server expiry");

    await sleep(900);
    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({ type: "attack", targetId: bId }));
    const buffedAuto = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.kind === "auto");
    assert.equal(buffedAuto.damage, 64, "three charges scale a 40-damage autoattack to 64");

    // Interrupt does not consume charges; the server expires them at the original six-second deadline.
    const [chargeExpired, respawnedAgain] = await Promise.all([
      waitMessage(a, m => m.type === "combat-resource" && Number(m.charges) === 0 && Number(m.chargeExpiresAt) === 0, 7000),
      waitMessage(b, m => m.type === "respawn" && m.player?.id === bId, 7000)
    ]);
    assert.equal(chargeExpired.charges, 0, "server clears expired Heroic Charges");
    assert.equal(respawnedAgain.player.hp, 1000, "dead target respawns at full HP");

    // Regression: Soulless hpDown must sync the corrected HP to the victim client.
    a.send(JSON.stringify({ type: "test-mode", enabled: false }));
    a.send(JSON.stringify({ type: "weapon", weapon: "galatine" }));
    a.send(JSON.stringify({ type: "loadout", q: "strike", w: "interrupt", p: "deepcuts" }));
    b.send(JSON.stringify({ type: "loadout", q: "strike", w: "parry", p: "deepcuts" }));
    a.send(JSON.stringify({ type: "state", x: 0, z: 0, rotation: 0 }));
    b.send(JSON.stringify({ type: "state", x: 0, z: 7, rotation: 0 }));
    await sleep(100);
    b.send(JSON.stringify({ type: "ability-hit", targetId: "", slot: "w", weapon: "broadsword", abilityId: "parry", aimX: 0, aimZ: 7 }));
    await waitMessage(b, m => m.type === "combat-status" && m.targetId === bId && m.statuses?.resist?.value === 1);
    // Parry must block incoming autoattacks for its full active window.
    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({ type: "attack", targetId: bId }));
    await sleep(150);
    assert.equal(b.messages.filter(m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.kind === "auto").length, 0, "Parry blocks autoattack damage while invulnerability is active");
    await sleep(700);
    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({ type: "ability-hit", targetId: "", slot: "e", weapon: "galatine", abilityId: "soulless", aimX: 0, aimZ: 7 }));
    await waitMessage(b, m => m.type === "combat-status" && m.targetId === bId && m.statuses?.hpDown);
    const hpDownSync = await waitMessage(b, m => m.type === "player" && m.player?.id === bId && m.player?.hp === 850);
    assert.equal(hpDownSync.player.hp, 850, "Soulless caps server HP and broadcasts the corrected value");

    // Bloodthirsty bleed and its independent 30% auto-attack bonus.
    await sleep(900);
    a.send(JSON.stringify({ type: "state", x: 0, z: 4, rotation: 0 }));
    a.send(JSON.stringify({ type: "weapon", weapon: "clarent" }));
    await sleep(100);
    a.messages.length = 0; b.messages.length = 0;
    const bloodDotsBefore = b.messages.filter(m => m.type === "combat-hit" && m.targetId === bId && m.kind === "dot" && m.abilityId === "bloodthirsty").length;
    const bloodCastAt = Date.now();
    a.send(JSON.stringify({ type: "ability-hit", targetId: "", slot: "e", weapon: "clarent", abilityId: "bloodthirsty", aimX: 0, aimZ: 7 }));
    const initialBleed = await waitMessage(b, m => m.type === "combat-status" && m.targetId === bId && m.statuses?.bleed?.value === 60);
    const initialBleedUntil = initialBleed.statuses.bleed.until;
    const bloodBuff = await waitMessage(a, m => m.type === "combat-status" && m.targetId === aId && m.statuses?.bloodthirstAttackBuff?.value === 0.3);
    assert.ok(bloodBuff.statuses.bloodthirstAttackBuff.until > Date.now(), "Bloodthirsty bonus has a server expiry");
    await sleep(900);
    a.messages.length = 0;
    a.send(JSON.stringify({ type: "weapon", weapon: "broadsword" }));
    a.send(JSON.stringify({ type: "attack", targetId: bId }));
    const bloodAuto = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.kind === "auto");
    assert.equal(bloodAuto.damage, 52, "Bloodthirsty grants 30% damage to a 40-damage autoattack");
    const bleedSnapshots = b.messages.filter(m => m.type === "combat-status" && m.targetId === bId && m.statuses?.bleed?.value === 60);
    assert.ok(bleedSnapshots.at(-1).statuses.bleed.until >= initialBleedUntil, "Bloodthirsty autoattacks do not truncate the original 5-second bleed");
    await sleep(Math.max(0, bloodCastAt + 6500 - Date.now()));
    const bloodDots = b.messages.filter(m => m.type === "combat-hit" && m.targetId === bId && m.kind === "dot" && m.abilityId === "bloodthirsty").length - bloodDotsBefore;
    assert.equal(bloodDots, 10, "a 5-second Bloodthirsty bleed resolves all ten 500ms ticks even after an autoattack refresh");

    // Passive regression coverage: Weakening reduces outgoing damage, Deep Cuts ticks,
    // Increased Defense is broadcast to the other player, and Heroic Fighting charges sync/expire remotely.
    a.send(JSON.stringify({ type: "loadout", q: "strike", w: "interrupt", p: "weakening" }));
    await sleep(100);
    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({ type: "attack", targetId: bId }));
    const weakeningAuto = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.kind === "auto");
    assert.equal(weakeningAuto.damage, 40, "Weakening passive does not reduce its own attack");
    const weakStatus = await waitMessage(b, m => m.type === "combat-status" && m.targetId === bId && m.statuses?.weak?.value === 0.04);
    assert.ok(weakStatus.statuses.weak.until > Date.now(), "Weakening debuff has a server expiry");
    a.messages.length = 0; b.messages.length = 0;
    b.send(JSON.stringify({ type: "attack", targetId: aId }));
    const weakenedAuto = await waitMessage(a, m => m.type === "combat-hit" && m.attackerId === bId && m.targetId === aId && m.kind === "auto");
    assert.equal(weakenedAuto.damage, 38, "Weakening reduces the target's 40-damage autoattack by 4%");
    await sleep(2100);

    a.send(JSON.stringify({ type: "loadout", q: "strike", w: "interrupt", p: "deepcuts" }));
    await sleep(100);
    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({ type: "attack", targetId: bId }));
    const deepAuto = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.kind === "auto");
    const deepStatus = await waitMessage(b, m => m.type === "combat-status" && m.targetId === bId && m.statuses?.deepBleed?.value === 53);
    assert.ok(deepStatus.statuses.deepBleed.until > Date.now(), "Deep Cuts fourth auto applies a timed bleed");
    const deepDot = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.kind === "dot" && m.abilityId === "deepcuts", 1500);
    assert.ok(deepDot.damage > 0, "Deep Cuts bleed damage is resolved by the server");
    await sleep(400);

    a.send(JSON.stringify({ type: "loadout", q: "strike", w: "interrupt", p: "increaseddef" }));
    await sleep(50);
    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({ type: "attack", targetId: bId }));
    await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.kind === "auto");
    const defenseStatus = await waitMessage(b, m => m.type === "combat-status" && m.targetId === aId && m.statuses?.defense?.value === 68);
    assert.ok(defenseStatus.statuses.defense.until > Date.now(), "Increased Defense is broadcast to the opponent with an expiry");
    a.messages.length = 0; b.messages.length = 0;
    b.send(JSON.stringify({ type: "attack", targetId: aId }));
    const defendedAuto = await waitMessage(a, m => m.type === "combat-hit" && m.attackerId === bId && m.targetId === aId && m.kind === "auto");
    assert.equal(defendedAuto.damage, 30, "68 defense reduces a 40-damage autoattack to 30");

    b.send(JSON.stringify({ type: "loadout", q: "strike", w: "parry", p: "heroicfighting" }));
    for (let i = 0; i < 2; i++) {
      await sleep(900);
      a.messages.length = 0; b.messages.length = 0;
      b.send(JSON.stringify({ type: "attack", targetId: aId }));
      await waitMessage(a, m => m.type === "combat-hit" && m.attackerId === bId && m.targetId === aId && m.kind === "auto");
    }
    const localCharge = await waitMessage(b, m => m.type === "combat-resource" && m.charges === 1 && m.chargeExpiresAt > Date.now());
    const remoteCharge = await waitMessage(a, m => m.type === "player" && m.player?.id === bId && m.player?.charges === 1 && m.player?.chargeExpiresAt > Date.now());
    assert.ok(localCharge.chargeExpiresAt <= Date.now() + 6000, "Heroic Fighting charge has a six-second server expiry");
    assert.ok(remoteCharge.player.chargeExpiresAt <= Date.now() + 6000, "Heroic Fighting charge timer is synced to the opponent");
    a.messages.length = 0; b.messages.length = 0;
    const [localChargeExpired, remoteChargeExpired] = await Promise.all([
      waitMessage(b, m => m.type === "combat-resource" && Number(m.charges) === 0 && Number(m.chargeExpiresAt) === 0, 7000),
      waitMessage(a, m => m.type === "player" && m.player?.id === bId && Number(m.player?.charges) === 0 && Number(m.player?.chargeExpiresAt) === 0, 7000)
    ]);
    assert.equal(localChargeExpired.charges, 0, "server clears the local Heroic Fighting charge on expiry");
    assert.equal(remoteChargeExpired.player.charges, 0, "server broadcasts charge expiry to other clients");

    console.log("PvP integration OK: damage, cooldowns, status expiry, Spinning endpoint, passive procs, DoT ticks/expiry, remote status sync and charge timers");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    for (const ws of clients) try { ws.close(); } catch {}
    server.kill("SIGTERM");
    await sleep(150);
  }
})();
