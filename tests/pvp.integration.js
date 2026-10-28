const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const WebSocket = require("ws");

const clientHtml = fs.readFileSync(path.join(__dirname, "..", "villagestrategy_albion_prototype (2).html"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const catalogSource = fs.readFileSync(path.join(__dirname, "..", "game-data", "catalog.js"), "utf8");
assert.ok(serverSource.includes('require("./game-data/catalog")'), "server inventory uses the shared item catalog");
assert.ok(catalogSource.includes("const TIERS = Object.freeze("), "item catalog defines extensible tiers");
assert.ok(catalogSource.includes("const ITEM_DEFINITIONS = Object.freeze("), "item catalog defines item metadata");
assert.ok(catalogSource.includes("const WEAPON_FAMILIES = Object.freeze("), "item catalog defines extensible weapon families");
assert.ok(catalogSource.includes("statModifiers"), "item metadata supports equipment stat modifiers");
assert.ok(serverSource.includes('const ALLOW_TEST_MODE = process.env.ALLOW_TEST_MODE === "true";'), "server free-cast mode is disabled unless explicitly enabled for tests");
assert.ok(serverSource.includes("const RESOURCE_RESPAWN_MS = 30 * 60 * 1000;"), "shared resources respawn after thirty minutes");
assert.ok(serverSource.includes("const RESOURCE_COUNTS = { wood: 62, stone: 24, ore: 12 };"), "server generates fixed world counts for each resource type");
assert.ok(serverSource.includes('ship: { name: "Корабль", inputs: { plank: 20, iron_ingot: 4 }, output: { ship: 1 }, seconds: 45, station: "shipyard" }'), "ship construction consumes refined materials at a shipyard");
assert.ok(serverSource.includes('shipyard: { name: "Верфь", cost: { wood: 20, stone: 12, plank: 8 }, recipe: "ship" }'), "shipyard has a server-validated construction cost");
assert.ok(clientHtml.includes("addPortDock(-49, -1); addPortDock(49, 1)"), "map has docks at both river mouths");
assert.ok(clientHtml.includes("addPrototypeBoat(1.5, -42.5, 0)"), "map includes prototype ship visuals");
assert.ok(clientHtml.includes("{id:'shipyard',name:'Верфь'") && clientHtml.includes("{id:'ship',name:'Корабль'"), "economy UI exposes shipyard construction and ship production");
assert.ok(serverSource.includes("Math.hypot(p.x - node.x, p.z - node.z) > 3.6"), "resource gathering validates server-side proximity");
assert.ok(serverSource.includes('type: "resource-node"'), "resource depletion and respawn are broadcast");
assert.ok(clientHtml.includes("nodeId:r.id"), "client sends the selected resource node ID");
assert.ok(clientHtml.includes("syncResourceWorld(msg.resources)"), "client renders the shared resource layout");
assert.ok(clientHtml.includes("if (p.id === mpId) {\n      if (Number.isFinite(Number(p.hp))) setPlayerHealth(Number(p.hp));\n      return;\n    }"), "client applies server HP corrections to the local player");
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
assert.ok(!clientHtml.includes("window.mpClearTarget(true);"), "Escape never clears the selected PvP target");
assert.ok(clientHtml.includes("ev.code==='Escape'"), "Escape closes the inventory panel");
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
    assert.ok(Array.isArray(wa.resources) && wa.resources.length === 98, "server sends the full shared resource world");
    assert.equal(wa.resources.filter(n => n.kind === "wood").length, 62, "shared world has 62 wood nodes");
    assert.equal(wa.resources.filter(n => n.kind === "stone").length, 24, "shared world has 24 stone nodes");
    assert.equal(wa.resources.filter(n => n.kind === "ore").length, 12, "shared world has 12 ore nodes");
    assert.deepEqual(wb.resources.map(n => n.id), wa.resources.map(n => n.id), "all players receive identical resource node IDs");
    a.messages.length = 0; b.messages.length = 0;
    a.send(JSON.stringify({type:"economy-get"}));
    const initialEconomy = await waitMessage(a, m => m.type === "economy-state");
    assert.equal(initialEconomy.economy.items.wood, 0);
    a.send(JSON.stringify({type:"economy-gather",resource:"wood"}));
    const rejectedGather = await waitMessage(a, m => m.type === "economy-state" && m.action === "gather");
    assert.equal(rejectedGather.ok, false, "server rejects gathering without a valid nearby node ID");
    const woodNode = wa.resources.find(n => n.kind === "wood");
    a.send(JSON.stringify({type:"state",x:woodNode.x,z:woodNode.z,rotation:0}));
    a.send(JSON.stringify({type:"economy-gather",resource:"wood",nodeId:woodNode.id,requestId:"resource-test-1"}));
    const gatheredEconomy = await waitMessage(a, m => m.type === "economy-state" && m.action === "gather" && m.ok === true);
    assert.equal(gatheredEconomy.economy.items.wood, 3, "server awards the configured wood yield");
    const depletedNode = await waitMessage(b, m => m.type === "resource-node" && m.node?.id === woodNode.id && m.node.depleted === true);
    assert.ok(depletedNode.node.respawnAt >= Date.now() + 29 * 60 * 1000, "shared node receives a thirty-minute server respawn deadline");
    assert.equal(gatheredEconomy.nodeId, woodNode.id, "gather confirmation identifies the depleted node");
    a.send(JSON.stringify({type:"economy-craft",recipe:"sword"}));
    const rejectedCraft = await waitMessage(a, m => m.type === "economy-state" && m.message.includes("станция"));
    assert.equal(rejectedCraft.economy.items.sword, 0, "crafting cannot bypass station requirements");
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
    // Regression: Spinning travels at most 12m. A target near the landing point
    // must be hit even when the cursor aim is 12.9m away (outside the actual landing circle).
    a.send(JSON.stringify({ type: "weapon", weapon: "dual" }));
    a.send(JSON.stringify({ type: "state", x: 0, z: 0, rotation: 0 }));
    b.send(JSON.stringify({ type: "state", x: 3.1, z: 12, rotation: 0 }));
    await sleep(100);
    a.send(JSON.stringify({ type: "ability-hit", targetId: "", slot: "e", weapon: "dual", abilityId: "spinning", aimX: 0, aimZ: 12.9 }));
    const spinningHit = await waitMessage(b, m => m.type === "combat-hit" && m.attackerId === aId && m.targetId === bId && m.abilityId === "spinning");
    assert.equal(spinningHit.damage, 500, "Spinning resolves its AoE at the server-authoritative 12m landing point");

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
