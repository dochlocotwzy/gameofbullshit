const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");
const { ITEM_DEFINITIONS } = require("./game-data/catalog");
const ALBION_PACK = require("./albion-weapon-branches.json");
const ALBION_BRANCHES = ALBION_PACK.branches;
const ALBION_WEAPONS = Object.fromEntries(Object.entries(ALBION_BRANCHES).flatMap(([branchId, branch]) => branch.weapons.map(weapon => [weapon.id, { ...weapon, branch: branchId }])));
const ALBION_SPELLS = Object.fromEntries(Object.entries(ALBION_BRANCHES).flatMap(([branchId, branch]) => Object.entries(branch.spells).map(([id, spell]) => [id, { ...spell, branch: branchId }])));
const ALBION_PASSIVES = Object.fromEntries(Object.entries(ALBION_BRANCHES).flatMap(([branchId, branch]) => Object.entries(branch.passives).map(([id, passive]) => [id, { ...passive, branch: branchId }])));

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";
const GAME_FILE = path.join(__dirname, "villagestrategy_albion_prototype (2).html");
const MAX_PLAYERS = 40;
// Free-cast mode is for explicitly opted-in test servers only; never trust a public client toggle.
const ALLOW_TEST_MODE = process.env.ALLOW_TEST_MODE === "true";
const PLAYER_MAX_HP = 1000;
const WEAPON_DAMAGE = { broadsword: 40, claymore: 58, dual: 44, clarent: 42, carving: 54, galatine: 46, kingmaker: 60, infinity: 44, ...Object.fromEntries(Object.values(ALBION_WEAPONS).map(w => [w.id, w.auto])) };
const ABILITY_MULTIPLIER = { q: 2.2, w: 2.8, e: 3.5 };
const Q_ALLOWED = new Set(["strike","cleave", ...Object.values(ALBION_BRANCHES).flatMap(b => b.q)]);
const W_ALLOWED = new Set(["cyclone","interrupt","splitting","hamstring","parry","ironwill", ...Object.values(ALBION_BRANCHES).flatMap(b => b.w)]);
const PASSIVE_ALLOWED = new Set(["deepcuts","weakening","heroicfighting","increaseddef", ...Object.keys(ALBION_PASSIVES)]);
const WEAPON_E = { broadsword:"mightyBlow", claymore:"charge", dual:"spinning", clarent:"bloodthirsty", carving:"carvingDash", galatine:"soulless", kingmaker:"majestic", infinity:"infinity", ...Object.fromEntries(Object.values(ALBION_WEAPONS).map(w => [w.id, w.e])) };
const ABILITIES = {
 strike:{cost:6,cooldown:3,damage:249,range:3.2,selfEffects:[{type:"charge",amount:1},{type:"haste",value:.2,duration:3.5}]}, cleave:{cost:11,cooldown:3,damage:200,radius:6,selfEffects:[{type:"charge",amount:1},{type:"haste",value:.2,duration:5}]},
 cyclone:{cost:24,cooldown:10,damage:120,radius:2.4,hits:3,range:7,path:true}, interrupt:{cost:32,cooldown:10,damage:248,range:3.2,effects:[{type:"interrupt"}],selfEffects:[{type:"interruptAttackBuff",value:.2,duration:5}]},
 splitting:{cost:38,cooldown:15,damage:432,line:14,effects:[{type:"root",duration:1.25}]}, hamstring:{cost:32,cooldown:10,damage:192,range:3.2,effects:[{type:"slow",value:.38,duration:8}]},
 parry:{cost:9,cooldown:15,damage:80,radius:6,effects:[{type:"silence",duration:.8}],selfEffects:[{type:"resist",value:1,duration:.8}]}, ironwill:{cost:29,cooldown:20,self:true,selfEffects:[{type:"haste",value:.2,duration:4},{type:"resist",value:.259,duration:4}]},
 mightyBlow:{cost:35,cooldown:10,damage:269,range:10,dash:1.7,effects:[{type:"interrupt"}],selfEffects:[{type:"resist",value:.7,duration:3}]}, charge:{cost:16,cooldown:20,damage:390,range:13,dash:1.7,effects:[{type:"stun",duration:.8}]},
 spinning:{cost:20,cooldown:20,damage:500,radius:3.2,range:12,selfEffects:[{type:"haste",value:.5,duration:4},{type:"attackBuff",value:1,duration:4}]},
 bloodthirsty:{cost:14,cooldown:20,damage:260,radius:5,effects:[{type:"bleed",dps:60,duration:5}],selfEffects:[{type:"haste",value:.3,duration:6},{type:"bloodthirstAttackBuff",value:.3,duration:6},{type:"bloodthirst",duration:6}]}, carvingDash:{cost:20,cooldown:14,damage:260,line:6.5,range:6,effects:[{type:"armorBreak",duration:5}]},
 soulless:{cost:28,cooldown:20,damage:150,radius:4.5,range:14,hits:3,effects:[{type:"hpDown",value:.15,duration:6}]}, majestic:{cost:30,cooldown:25,damage:330,radius:6,hits:2,secondDamage:480,effects:[{type:"air",duration:.9}]},
 infinity:{cost:25,cooldown:18,damage:210,radius:5,hits:3,secondDamage:380,effects:[{type:"slow",value:.3,duration:2}]}
};
const ABILITY_IDS = new Set(["strike","cleave","cyclone","interrupt","splitting","hamstring","parry","ironwill",...Object.values(WEAPON_E), ...Object.keys(ALBION_SPELLS)]);
const ATTACK_RANGE = 3.8; // PvP auto-attack reach
const ATTACK_COOLDOWN_MS = 850;
const MOVE_SPEED = 5.2;
const RUN_SPEED = 8.0;
const MAP_SCALE = 2.3;
const WORLD_BOUND = 126.5;
const VISION_RADIUS = 20;
const VISION_SYNC_MS = 250;
const TICK_MS = 50;
// Keep server collision/resource rules aligned with the river drawn by the client.
const RIVER_CENTER = [[0,-55],[3,-42],[0,-28],[-4,-18],[-7,0],[-4,18],[0,28],[3,42],[0,55]].map(([x,z]) => [x*MAP_SCALE,z*MAP_SCALE]);
const RIVER_BLOCK_RADIUS = 3.45 * MAP_SCALE;
const RIVER_BRIDGES = [[0,-28],[-7,0],[0,28]].map(([x,z]) => [x*MAP_SCALE,z*MAP_SCALE]);
function closestRiverPoint(x, z) {
  let best = { x: 0, z: 0, distance: Infinity, nx: 1, nz: 0, dx: 0, dz: 0 };
  for (let i = 0; i < RIVER_CENTER.length - 1; i++) {
    const a = RIVER_CENTER[i], b = RIVER_CENTER[i + 1];
    const vx = b[0] - a[0], vz = b[1] - a[1], len2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / len2));
    const px = a[0] + vx * t, pz = a[1] + vz * t;
    const dx = x - px, dz = z - pz, distance = Math.hypot(dx, dz);
    if (distance < best.distance) {
      const len = Math.sqrt(len2);
      best = { x: px, z: pz, distance, nx: -vz / len, nz: vx / len, dx, dz };
    }
  }
  return best;
}
function isBridgeCrossing(x, z) {
  return RIVER_BRIDGES.some(([bx, bz]) => Math.abs(x - bx) <= 4.15 && Math.abs(z - bz) <= 2.15);
}
function isRiverBlocked(x, z) {
  return !isBridgeCrossing(x, z) && closestRiverPoint(x, z).distance < RIVER_BLOCK_RADIUS;
}
function safeLandPosition(fromX, fromZ, toX, toZ) {
  const distance = Math.hypot(toX - fromX, toZ - fromZ);
  const steps = Math.max(1, Math.ceil(distance / 0.25));
  let x = fromX, z = fromZ;
  for (let i = 1; i <= steps; i++) {
    const nx = fromX + (toX - fromX) * i / steps;
    const nz = fromZ + (toZ - fromZ) * i / steps;
    if (isRiverBlocked(nx, nz)) break;
    x = nx; z = nz;
  }
  return { x, z };
}
const players = new Map();

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    return res.end("ok");
  }
  if (req.url === "/" || req.url.startsWith("/?")) {
    fs.readFile(GAME_FILE, (err, data) => {
      if (err) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        return res.end("Game HTML file not found in repository root.");
      }
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache"
      });
      res.end(data);
    });
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const wss = new WebSocket.Server({ server, path: "/multiplayer" });

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}
function isInVision(observer, x, z) { return !!observer && Math.hypot(observer.x - x, observer.z - z) <= VISION_RADIUS; }
function snapshot(viewer) {
  return [...players.values()].filter(other => other.id !== viewer?.id && (!viewer || isInVision(viewer, other.x, other.z))).map(p => ({
    id: p.id, name: p.name, team: p.team, x: p.x, y: p.y, z: p.z, rotation: p.rotation, hp: p.hp, statuses: p.statuses || {}, charges: p.charges || 0, chargeExpiresAt: p.chargeExpiresAt || 0, weapon: p.weapon || "broadsword"
  }));
}
function broadcast(payload, exceptId) {
  if ((payload.type === "player" || payload.type === "joined" || payload.type === "respawn") && payload.player) {
    const subject = payload.player;
    for (const observer of players.values()) if (observer.id !== exceptId && observer.ws.readyState === WebSocket.OPEN && isInVision(observer, subject.x, subject.z)) send(observer.ws, payload);
    return;
  }
  if ((payload.type === "factory-created" || payload.type === "factory-damaged") && payload.factory) {
    const factory = payload.factory;
    for (const observer of players.values()) if (observer.id !== exceptId && observer.ws.readyState === WebSocket.OPEN && isInVision(observer, factory.x, factory.z)) send(observer.ws, payload);
    return;
  }
  if (payload.type === "resource-node" && payload.node) {
    const node = payload.node;
    for (const observer of players.values()) if (observer.ws.readyState === WebSocket.OPEN && isInVision(observer, node.x, node.z)) send(observer.ws, payload);
    return;
  }
  if (payload.type === "combat-effect" && payload.attackerId) {
    const attacker = players.get(payload.attackerId);
    for (const observer of players.values()) if (observer.id !== exceptId && observer.ws.readyState === WebSocket.OPEN && attacker && isInVision(observer, attacker.x, attacker.z)) send(observer.ws, payload);
    return;
  }
  const message = JSON.stringify(payload);
  for (const p of players.values()) if (p.id !== exceptId && p.ws.readyState === WebSocket.OPEN) p.ws.send(message);
}
function publicPlayer(p) { return {id:p.id,name:p.name,team:p.team,x:p.x,y:0,z:p.z,rotation:p.rotation,hp:p.hp,statuses:p.statuses||{},charges:p.charges||0,chargeExpiresAt:p.chargeExpiresAt||0,weapon:p.weapon||"broadsword"}; }
function chooseTeam() { let blue=0,red=0; for(const player of players.values()){if(player.team==="blue")blue++;else if(player.team==="red")red++;} if(blue===red)return crypto.randomInt(0,2)?"blue":"red"; return blue<red?"blue":"red"; }
function isParryInvulnerable(target, now = Date.now()) {
  return !!(target?.statuses?.parryLock && target.statuses.parryLock.until > now);
}
function isCombatInvulnerable(target, now = Date.now(), spell = false) {
  return isParryInvulnerable(target,now) || !!(target?.statuses?.invuln && target.statuses.invuln.until>now) || (spell && !!(target?.statuses?.spellImmune && target.statuses.spellImmune.until>now));
}
function absorbShield(target, amount) {
  const now=Date.now(), shield=target?.statuses?.shield;
  if(!shield||shield.until<=now||Number(shield.value)<=0)return Math.max(0,amount);
  const absorbed=Math.min(Number(shield.value)||0,Math.max(0,amount));
  shield.value=Math.max(0,(Number(shield.value)||0)-absorbed);
  if(shield.value<=0)delete target.statuses.shield;
  broadcast({type:"combat-status",targetId:target.id,statuses:target.statuses});
  return Math.max(0,amount-absorbed);
}
function applyEffects(target,effects,sourceId) {
  if(!target.statuses)target.statuses={};
  const now=Date.now();
  if(target.pendingAttack&&effects.some(e=>["stun","air"].includes(e.type))){
    const cancelledAttack=target.pendingAttack;target.pendingAttack=null;
    broadcast({type:"combat-cancelled",attackerId:target.id,targetId:cancelledAttack.targetId,attackId:cancelledAttack.id});
  }
  for(const e of effects||[]){
    if(!e||!e.type)continue;
    if(e.type==="charge"){target.charges=Math.min(3,(target.charges||0)+(e.amount||1));target.chargeExpiresAt=now+6000;continue;}
    if(e.type==="energy"){target.energy=Math.min(100,(Number(target.energy)||0)+(Number(e.amount)||0));continue;}
    if(e.type==="interrupt"){target.statuses.casting={value:false,until:now+500,sourceId};continue;}
    if(e.type==="knockback"||e.type==="pull"){
      const source=players.get(String(sourceId||""));if(!source||target.id===source.id)continue;
      let dx=target.x-source.x,dz=target.z-source.z,d=Math.hypot(dx,dz)||1;
      const sign=(e.type==="pull"||e.toCaster)?-1:1;
      dx=dx/d*sign;dz=dz/d*sign;
      const distance=Math.max(0,Number(e.distance)||0),travel=distance;
      const land=safeLandPosition(target.x,target.z,Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,target.x+dx*travel)),Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,target.z+dz*travel)));
      target.x=land.x;target.z=land.z;target.positionLockUntil=now+350;
      broadcast({type:"player",player:publicPlayer(target)});continue;
    }
    if(e.type==="stackBleed"){
      const key=String(e.key||"axeBleed"),old=target.statuses[key],stacks=old&&old.until>now?Math.min(Number(e.maxStacks)||3,(Number(old.stacks)||1)+1):1;
      target.statuses[key]={value:Number(e.dps)||14,stacks,until:now+Math.round((Number(e.duration)||6)*1000),nextTickAt:old&&old.until>now&&old.nextTickAt?old.nextTickAt:now+500,sourceId};
      if(stacks>=(Number(e.maxStacks)||3)&&e.atMaxStacks){const block=e.atMaxStacks;target.statuses.healBlock={value:Number(block.value)||0,until:now+Math.round((Number(block.duration)||5)*1000),sourceId};}
      continue;
    }
    if(e.type==="moveBleed"){
      target.statuses.moveBleed={value:Number(e.tick)||67,interval:Math.max(.1,Number(e.interval)||.5),lastX:target.x,lastZ:target.z,nextTickAt:now+Math.max(.1,Number(e.interval)||.5)*1000,until:now+Math.round((Number(e.duration)||8)*1000),sourceId};continue;
    }
    if(e.type==="healOverTime"){
      target.statuses.healOverTime={value:Number(e.amount)||0,interval:Math.max(.2,Number(e.interval)||1),nextTickAt:now+Math.max(.2,Number(e.interval)||1)*1000,until:now+Math.round((Number(e.duration)||5)*1000),sourceId};continue;
    }
    if(e.type==="shield"){
      const old=target.statuses.shield, amount=Math.max(0,Number(e.value)||0);
      target.statuses.shield={value:Math.max(old&&old.until>now?Number(old.value)||0:0,amount),until:now+Math.round((Number(e.duration)||1)*1000),sourceId};continue;
    }
    if(e.type==="dispelBuffs"){
      for(const key of ["haste","resist","shield","attackBuff","damageBuff","attackSpeed","healOverTime","lifesteal"])delete target.statuses[key];
      continue;
    }
    if(e.type==="auraStack"){
      const oldAura=target.statuses.auraStack, max=Math.max(1,Number(e.max)||3);
      target.statuses.auraStack={value:Math.min(max,(oldAura&&oldAura.until>now?Number(oldAura.value)||0:0)+1),until:now+Math.round((Number(e.duration)||5)*1000),sourceId};continue;
    }
    const control=["stun","root","silence","slow","air"].includes(e.type);
    if(control&&target.statuses.ccImmune&&target.statuses.ccImmune.until>now)continue;
    let duration=Math.max(0.05,Number(e.duration)||1);
    if(control&&target.statuses.ccResist&&target.statuses.ccResist.until>now)duration*=1-Math.max(0,Math.min(.9,Number(target.statuses.ccResist.value)||0));
    const source=players.get(String(sourceId||""));
    if(control&&source?.statuses?.ccDurationBonus&&source.statuses.ccDurationBonus.until>now)duration*=1+Math.max(0,Number(source.statuses.ccDurationBonus.value)||0);
    const key=e.type,old=target.statuses[key]||{};
    target.statuses[key]={value:e.value??e.dps??true,until:now+Math.round(duration*1000),sourceId};
    if(key==="bleed"||key==="deepBleed")target.statuses[key].nextTickAt=now+500;
    if(key==="hpDown")target.hp=Math.min(target.hp,Math.round(PLAYER_MAX_HP*(1-Math.max(0,Math.min(.9,Number(e.value)||0)))));
  }
  broadcast({type:"combat-status",targetId:target.id,statuses:target.statuses});
}
function handleAlbionAbility(p, ws, msg, ability, abilityId, slot) {
  const now=Date.now(), branch=ALBION_BRANCHES[ability.branch], weaponBranch=ALBION_WEAPONS[p.weapon]?.branch||null;
  const validLoadout=slot==="e"?WEAPON_E[p.weapon]===abilityId:p.loadout?.[slot]===abilityId;
  if(!branch||weaponBranch!==ability.branch||slot!==ability.slot||!validLoadout){send(ws,{type:"combat",result:"invalid-ability",abilityId,slot,energy:p.energy});return;}
  if(p.hp<=0||p.statuses?.stun||p.statuses?.air||p.statuses?.silence||(p.statuses?.cannotAttack&&p.statuses.cannotAttack.until>now)){send(ws,{type:"combat",result:"disabled",abilityId,energy:p.energy});return;}
  if(now-p.lastAbility<250)return;
  if(!p.testMode&&(p.abilityCooldowns[abilityId]||0)>now){send(ws,{type:"combat",result:"cooldown",abilityId,until:p.abilityCooldowns[abilityId],energy:p.energy});return;}
  if(!p.testMode&&p.energy<ability.cost){send(ws,{type:"combat",result:"energy",abilityId,energy:p.energy});return;}
  const target=msg.targetId?players.get(String(msg.targetId)):null, ax=Number(msg.aimX),az=Number(msg.aimZ),hasAim=Number.isFinite(ax)&&Number.isFinite(az);
  const origin={x:p.x,z:p.z}, aim=hasAim?{x:ax,z:az}:null;
  let dir=aim?{x:aim.x-p.x,z:aim.z-p.z}:{x:Math.sin(p.rotation||0),z:Math.cos(p.rotation||0)};
  let dl=Math.hypot(dir.x,dir.z)||1;dir={x:dir.x/dl,z:dir.z/dl};
  const maxRange=Math.max(0,Number(ability.range)||0);
  if(aim&&maxRange>0&&Math.hypot(aim.x-p.x,aim.z-p.z)>maxRange){aim.x=p.x+dir.x*maxRange;aim.z=p.z+dir.z*maxRange;}
  if(ability.target==="enemy"&&ability.shape?.type==="single"&&(!target||target.hp<=0||target.id===p.id||target.team===p.team||Math.hypot(target.x-p.x,target.z-p.z)>maxRange+.01)){send(ws,{type:"combat",result:target?"out-of-range":"no-target",abilityId,energy:p.energy});return;}
  if(!ability.dash&&ability.target==="ground"&&ability.shape?.origin==="aim"&&!aim){send(ws,{type:"combat",result:"invalid-aim",abilityId,energy:p.energy});return;}
  if(ability.dash&&aim){
    const d=Math.hypot(aim.x-p.x,aim.z-p.z),travel=Math.min(Number(ability.dash.distance)||maxRange,d);
    if(d>.05&&travel>0){const land=safeLandPosition(p.x,p.z,Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,p.x+(aim.x-p.x)/d*travel)),Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,p.z+(aim.z-p.z)/d*travel)));p.x=land.x;p.z=land.z;p.rotation=Math.atan2(dir.x,dir.z);p.positionLockUntil=Date.now()+Math.max(300,(Number(ability.dash.dur)||.35)*1000+150);broadcast({type:"player",player:publicPlayer(p)});}
  }
  const center={x:p.x,z:p.z};
  const resolve=(shape,selected)=> {
    shape=shape||ability.shape||{type:"single"};const type=shape.type;
    const enemies=[...players.values()].filter(t=>t.hp>0&&t.id!==p.id&&t.team!==p.team);
    if(type==="single")return selected&&selected.hp>0&&selected.team!==p.team&&Math.hypot(selected.x-p.x,selected.z-p.z)<=maxRange+.01?[selected]:[];
    if(type==="self")return [];
    let cx=center.x,cz=center.z;
    if(shape.origin==="aim"){if(!aim)return [];cx=aim.x;cz=aim.z;}
    if(shape.origin==="selfFront"){cx=p.x+dir.x*(Number(shape.offset)||0);cz=p.z+dir.z*(Number(shape.offset)||0);}
    const radius=Math.max(0,Number(shape.radius)||0),inner=Math.max(0,Number(shape.innerRadius)||0);
    if(type==="circle"||type==="combo")return enemies.filter(t=>{const d=Math.hypot(t.x-cx,t.z-cz);return d<=radius+.35&&d>=inner-.35;});
    if(type==="cone"){const half=Math.max(1,Math.min(360,Number(shape.angle)||90))*Math.PI/360;return enemies.filter(t=>{const dx=t.x-p.x,dz=t.z-p.z,d=Math.hypot(dx,dz);return d<=radius+.35&&d>=inner-.35&&(d<.35||(dx/d)*dir.x+(dz/d)*dir.z>=Math.cos(half));});}
    if(type==="line"){const len=Math.max(0,Number(shape.length)||0),width=Math.max(.2,Number(shape.width)||1),start=Math.max(0,Number(shape.start)||0);return enemies.filter(t=>{const dx=t.x-p.x,dz=t.z-p.z,along=dx*dir.x+dz*dir.z,side=Math.abs(dx*dir.z-dz*dir.x);return along>=start&&along<=len&&side<=width/2+.35;});}
    return [];
  };
  const selfEffects=ability.selfEffects||[];
  const selfCast=ability.target==="self";
  let victims=selfCast&&!ability.hits&&!ability.zone?[]:resolve(ability.shape,target);
  if(ability.shape?.type==="single"&&!victims.length&&ability.target==="enemy"){send(ws,{type:"combat",result:target?"out-of-range":"no-target",abilityId,energy:p.energy});return;}
  if(!selfCast&&ability.target==="ground"&&!aim&&!ability.dash&&ability.shape?.origin==="aim"){send(ws,{type:"combat",result:"invalid-aim",abilityId,energy:p.energy});return;}
  p.lastAbility=now;if(!p.testMode){p.energy-=ability.cost;p.abilityCooldowns[abilityId]=now+ability.cooldown*1000;}
  if(selfEffects.length)applyEffects(p,selfEffects,p.id);
  let hits=Array.isArray(ability.hits)&&ability.hits.length?ability.hits:[{delay:0,damage:0,effects:ability.effects||[]}];
  if(ability.pulses&&Number(ability.pulses.count)>0){
    const pulse=ability.pulses;
    hits=Array.from({length:Math.min(20,Math.max(1,Number(pulse.count)||1))},(_,i)=>({delay:i*(Number(pulse.interval)||0.5),damage:Number(pulse.damage)||0,effects:ability.effects||[],pulseBuff:pulse.selfBuffPerPulse}));
  } else if(ability.channel&&Number(ability.channel.ticks)>0){
    const base=hits.length===1?hits[0]:{damage:0,effects:ability.effects||[]};
    hits=Array.from({length:Math.min(20,Math.max(1,Number(ability.channel.ticks)||1))},(_,i)=>({...base,delay:i*(Number(ability.channel.interval)||1)}));
  } else if(ability.chain&&Number(ability.chain)>1){
    const base=hits[0]||{damage:0,effects:ability.effects||[]};
    hits=Array.from({length:Math.min(10,Number(ability.chain))},(_,i)=>({...base,delay:(Number(base.delay)||0)+i*0.35}));
  }
  for(const hit of hits){
    setTimeout(()=>{
      if(p.hp<=0)return;
      const hitVictims=hit.shape?resolve(hit.shape,target):victims.filter(v=>v.hp>0);
      const bonus=1+Math.max(0,hitVictims.length-1)*(Number(ability.multiTargetBonus)||0);
      for(const victim of hitVictims){
        if(victim.hp<=0||isCombatInvulnerable(victim,Date.now(),true))continue;
        const reduction=victim.statuses?.resist&&victim.statuses.resist.until>Date.now()?Math.max(0,Math.min(.9,Number(victim.statuses.resist.value)||0)):0;
        const defense=victim.statuses?.defense&&victim.statuses.defense.until>Date.now()?Math.max(0,Number(victim.statuses.defense.value)||0):0;
        const defenseReduction=defense>0?Math.min(.5,defense/(defense+200)):0;
        const armor=victim.statuses?.armorBreak&&victim.statuses.armorBreak.until>Date.now()?(1+Math.max(0,Number(victim.statuses.armorBreak.value)||0)):1;
        const weak=p.statuses?.weak&&p.statuses.weak.until>Date.now()?Math.max(0,Math.min(.9,Number(p.statuses.weak.value)||0)):0;
        const outgoingBonus=["attackBuff","damageBuff","attackSpeed"].reduce((sum,key)=>{const st=p.statuses?.[key];return sum+(st&&st.until>Date.now()?Math.max(0,Number(st.value)||0):0);},0);
        const raw=Number(hit.damage)||0,dealt=Math.max(0,Math.round(raw*bonus*(1+outgoingBonus)*(1-reduction)*(1-defenseReduction)*(1-weak)*armor));
        const actualDealt=absorbShield(victim,dealt);
        victim.hp=Math.max(0,victim.hp-actualDealt);
        broadcast({type:"combat-hit",attackerId:p.id,targetId:victim.id,damage:actualDealt,hp:victim.hp,kind:"ability",slot,abilityId,hitIndex:hits.indexOf(hit)});
        if(victim.hp>0)applyEffects(victim,hit.effects||ability.effects||[],p.id);
        if(hit.pulseBuff&&victim.hp>0)applyEffects(p,[hit.pulseBuff],p.id);
        if(victim.hp===0&&!victim.respawnTimer)scheduleRespawn(victim);
        broadcast({type:"player",player:publicPlayer(victim)});
        if(actualDealt>0&&p.statuses?.lifesteal&&p.statuses.lifesteal.until>Date.now())p.hp=Math.min(PLAYER_MAX_HP,p.hp+Math.round(actualDealt*(Number(p.statuses.lifesteal.value)||0)));
      }
      if(ability.zone?.effects)for(const victim of hitVictims)if(victim.hp>0)applyEffects(victim,ability.zone.effects,p.id);
      broadcast({type:"combat-effect",attackerId:p.id,abilityId,targetIds:hitVictims.map(v=>v.id),x:center.x,z:center.z,originX:origin.x,originZ:origin.z,aimX:aim?.x??center.x,aimZ:aim?.z??center.z,rotation:p.rotation,weapon:p.weapon});
    },Math.max(0,Number(hit.delay)||0)*1000);
  }
  if(ability.dash?.landing){
    const landing=ability.dash.landing, landingDelay=Math.max(0,Number(ability.dash.dur)||0.35)*1000;
    setTimeout(()=>{
      if(p.hp<=0)return;
      const radius=Math.max(0,Number(landing.radius)||0), landingVictims=[...players.values()].filter(v=>v.hp>0&&v.id!==p.id&&v.team!==p.team&&Math.hypot(v.x-p.x,v.z-p.z)<=radius+0.35);
      const bonus=1+Math.max(0,landingVictims.length-1)*(Number(ability.multiTargetBonus)||0);
      for(const victim of landingVictims){
        if(Number(landing.damage)>0){const dealt= Math.max(0,Math.round(Number(landing.damage)*bonus));const actual=absorbShield(victim,dealt);victim.hp=Math.max(0,victim.hp-actual);broadcast({type:"combat-hit",attackerId:p.id,targetId:victim.id,damage:actual,hp:victim.hp,kind:"ability",slot,abilityId,hitIndex:"landing"});}
        if(victim.hp>0)applyEffects(victim,landing.effects||[],p.id);
        if(victim.hp===0&&!victim.respawnTimer)scheduleRespawn(victim);
        broadcast({type:"player",player:publicPlayer(victim)});
      }
      if(landing.innerEffects)for(const victim of landingVictims)if(victim.hp>0&&Math.hypot(victim.x-p.x,victim.z-p.z)<=Number(landing.innerEffects.radius||0))applyEffects(victim,landing.innerEffects.effects||[],p.id);
      broadcast({type:"combat-effect",phase:"landing",attackerId:p.id,abilityId,targetIds:landingVictims.map(v=>v.id),x:p.x,z:p.z,originX:origin.x,originZ:origin.z,aimX:aim?.x??p.x,aimZ:aim?.z??p.z,rotation:p.rotation,weapon:p.weapon});
    },landingDelay);
  }
  if(ability.zone?.selfEffects)applyEffects(p,ability.zone.selfEffects,p.id);
  send(ws,{type:"combat-resource",energy:p.energy,abilityId,cooldownUntil:p.abilityCooldowns[abilityId]||0,charges:p.charges||0,chargeExpiresAt:p.chargeExpiresAt||0,statuses:p.statuses||{}});
}
function spawnPosition(index) {
  // Prototype starts every player in the left village until team-specific bases are built.
  const slot = Math.max(0, index|0), angle = (slot % 8) * (Math.PI / 4), radius = 2.4 + Math.floor(slot / 8) * 2.4;
  const candidate = { x: Math.round((-31 + Math.cos(angle)*radius) * MAP_SCALE * 100) / 100, z: Math.round((-7 + Math.sin(angle)*radius) * MAP_SCALE * 100) / 100 };
  return isRiverBlocked(candidate.x, candidate.z) ? safeLandPosition(-31*MAP_SCALE, -7*MAP_SCALE, candidate.x, candidate.z) : candidate;
}
function scheduleRespawn(target){if(target.respawnTimer)return;target.respawnTimer=setTimeout(()=>{const spawn=spawnPosition(target.spawnIndex);target.hp=PLAYER_MAX_HP;target.x=spawn.x;target.z=spawn.z;target.rotation=0;target.statuses={};target.charges=0;target.chargeExpiresAt=0;target.autoCount=0;target.moveTarget=null;target.input={x:0,z:0,running:false};target.respawnTimer=null;broadcast({type:"respawn",player:publicPlayer(target)});},5000);}
const RESOURCE_RESPAWN_MS = 30 * 60 * 1000;
const RESOURCE_COUNTS = { wood: 62, stone: 24, ore: 12 };
const worldFactories = [];
let nextWorldFactoryId = 1;
const RESOURCE_YIELDS = { wood: 3, stone: 2, ore: 2 };
const worldResources = [];
function generateResourceWorld() {
  const nodes = [];
  const random = () => crypto.randomInt(0, 1_000_000) / 1_000_000;
  const minDistance = 2.8 * MAP_SCALE;
  for (const [kind, count] of Object.entries(RESOURCE_COUNTS)) {
    let tries = 0;
    while (nodes.filter(n => n.kind === kind).length < count && tries++ < 50000) {
      const currentKindCount = nodes.filter(n => n.kind === kind).length;
      const anchors = { wood:[[8,-8],[14,2],[-2,15]], stone:[[4,18],[15,12]], ore:[[0,-18]] };
      const anchor = anchors[kind]?.[currentKindCount];
      const baseX = -31 * MAP_SCALE, baseZ = -7 * MAP_SCALE;
      const angle = random() * Math.PI * 2;
      const radius = 17 + random() * 32;
      const x = anchor ? Math.round((baseX + anchor[0] + (random()-.5)*.4) * 100) / 100 : Math.round(Math.cos(angle) * radius * MAP_SCALE * 100) / 100;
      const z = anchor ? Math.round((baseZ + anchor[1] + (random()-.5)*.4) * 100) / 100 : Math.round(Math.sin(angle) * radius * MAP_SCALE * 100) / 100;
      if (Math.hypot(x, z) > WORLD_BOUND - 6 || Math.hypot(x, z) < 14 * MAP_SCALE) continue;
      // Exclude the river and its sandy banks from every server-generated resource cluster.
      if (closestRiverPoint(x, z).distance < 5.5) continue;
      if (nodes.some(n => Math.hypot(n.x - x, n.z - z) < minDistance)) continue;
      nodes.push({ id: `res-${nodes.length + 1}`, kind, x, z, scale: Math.round((0.85 + random() * 0.55) * 100) / 100, variant: Math.floor(random() * 4), depleted: false, respawnAt: 0, lastGatherAt: 0 });
    }
    if (nodes.filter(n => n.kind === kind).length !== count) throw new Error(`Unable to generate resource nodes: ${kind}`);
  }
  return nodes;
}
worldResources.push(...generateResourceWorld());
function publicResource(node) {
  return { id: node.id, kind: node.kind, x: node.x, z: node.z, scale: node.scale, variant: node.variant, depleted: node.depleted, respawnAt: node.respawnAt };
}
function resourceWorldSnapshot(viewer) { return worldResources.filter(node => !viewer || isInVision(viewer,node.x,node.z)).map(publicResource); }
function broadcastResource(node) {
  const fullNode = publicResource(node);
  // Every client learns the global depletion/respawn state, but hidden nodes never leak coordinates.
  // Clients without the node locally ignore this ID-only event and receive its current state on entering vision.
  for (const viewer of players.values()) {
    const visible = isInVision(viewer, node.x, node.z);
    send(viewer.ws, {
      type: "resource-node",
      node: visible ? fullNode : {
        id: node.id,
        kind: node.kind,
        depleted: node.depleted,
        respawnAt: node.respawnAt
      }
    });
  }
}
const ECONOMY_ITEMS = new Set(Object.keys(ITEM_DEFINITIONS).filter(itemId => itemId !== "sword"));
const ECONOMY_RECIPES = {
  plank: { name: "Доски", inputs: { wood: 2 }, output: { plank: 1 }, seconds: 3, station: "sawmill" },
  iron_ingot: { name: "Железный слиток", inputs: { ore: 2, wood: 1 }, output: { iron_ingot: 1 }, seconds: 5, station: "smelter" },
  ship: { name: "Корабль", inputs: { plank: 20, iron_ingot: 4 }, output: { ship: 1 }, seconds: 45, station: "shipyard" }
};
const FACTORY_TYPES = {
  sawmill: { name: "Лесопилка", cost: { wood: 8, stone: 4 }, recipe: "plank" },
  smelter: { name: "Плавильня", cost: { wood: 6, stone: 8 }, recipe: "iron_ingot" },
  shipyard: { name: "Верфь", cost: { wood: 20, stone: 12, plank: 8 }, recipe: "ship" }
};
function publicFactory(f) { return { id:f.id, type:f.type, name:FACTORY_TYPES[f.type]?.name || f.type, recipe:f.recipe, x:f.x, z:f.z, ownerId:f.ownerId, ownerName:f.ownerName, team:f.team, hp:f.hp, buildingUntil:f.buildingUntil || 0, buildingDuration:f.buildingDuration || 5000, running:!!f.running }; }
function factoryWorldSnapshot(viewer) { return worldFactories.filter(f => !viewer || isInVision(viewer,f.x,f.z)).map(publicFactory); }
function sendVisionSnapshot(p) {
  const now=Date.now(); if(now-(p.lastVisionSyncAt||0)<VISION_SYNC_MS)return; p.lastVisionSyncAt=now;
  send(p.ws,{type:"world-vision",players:snapshot(p),resources:resourceWorldSnapshot(p),factories:factoryWorldSnapshot(p)});
}
function economySnapshot(p) {
  const e = p.economy || { items: {}, factories: [] };
  return { items: { ...(e.items || {}) }, activeFactoryId:p.activeFactoryId || null, factories: (e.factories || []).map(f => ({ ...publicFactory(f), progress:Math.max(0,Math.min(1, f.duration ? (Date.now()-f.startedAt)/f.duration : 0)), remainingMs:f.running ? Math.max(0,f.startedAt+f.duration-Date.now()) : 0 })) };
}
function factoryReady(f) { return !!f && (!f.buildingUntil || f.buildingUntil <= Date.now()); }
function factoryNear(p, f, range=7.5) { return !!f && Math.hypot(p.x-f.x,p.z-f.z)<=range; }
function factoryPlacementClear(x,z) {
  if (!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>WORLD_BOUND-5||Math.abs(z)>WORLD_BOUND-5||isRiverBlocked(x,z)) return false;
  const villageCenters=[[-13,-37],[13,-39],[-37,-7],[-35,7],[37,-7],[35,7],[-13,37],[13,39]].map(([a,b])=>[a*MAP_SCALE,b*MAP_SCALE]);
  if (villageCenters.some(([a,b])=>Math.hypot(x-a,z-b)<11.5)) return false;
  if (Math.hypot(x,z)<20) return false;
  if (worldResources.some(node => !node.depleted && Math.hypot(x-node.x,z-node.z) < 6.5)) return false;
  return !worldFactories.some(f=>Math.hypot(x-f.x,z-f.z)<12);
}
function getActiveFactory(p) { const f=worldFactories.find(item=>item.id===p.activeFactoryId && item.ownerId===p.id); return factoryReady(f)&&factoryNear(p,f)?f:null; }
function sendEconomy(p, message = "Склад обновлён.", extra = {}) {
  if (p.economy) p.economy.lastUiUpdate = Date.now();
  send(p.ws, { type:"economy-state", economy:economySnapshot(p), message, ...extra });
}
function hasItems(items, cost) { return Object.entries(cost).every(([k,v]) => (items[k] || 0) >= v); }
function takeItems(items, cost) { for (const [k,v] of Object.entries(cost)) items[k] -= v; }
function addItems(items, output) { for (const [k,v] of Object.entries(output)) items[k] = (items[k] || 0) + v; }
function startFactoryJob(p, factory) {
  const recipe = ECONOMY_RECIPES[factory.recipe];
  if (!recipe || !hasItems(p.economy.items, recipe.inputs)) return false;
  takeItems(p.economy.items, recipe.inputs);
  factory.running = true; factory.startedAt = Date.now(); factory.duration = recipe.seconds * 1000;
  return true;
}
function safeName(value) {
  return String(value || "Player").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 18) || "Player";
}

wss.on("connection", (ws) => {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { type: "error", message: "Сервер заполнен." });
    return ws.close(1013, "Server full");
  }
  const id = crypto.randomUUID();
  const team = chooseTeam();
  const occupiedSpawnIndices = new Set([...players.values()].map(player => player.spawnIndex));
  let spawnIndex = 0;
  while (occupiedSpawnIndices.has(spawnIndex)) spawnIndex++;
  const spawn = spawnPosition(spawnIndex);
  const p = { id, ws, spawnIndex, team, economy: { items: Object.fromEntries([...ECONOMY_ITEMS].map(itemId => [itemId, 0])), factories: [], nextFactoryId: 1, lastGatherAt: {} }, name: "Игрок", x: spawn.x, y: 0, z: spawn.z, rotation: 0, hp: PLAYER_MAX_HP, lastUpdate: 0, lastAttack: 0, lastAbility: 0, lastVisionSyncAt:0, respawnTimer: null, input: {x:0,z:0,running:false}, moveTarget: null, testMode: false, statuses: {}, charges: 0, energy: 100, abilityCooldowns: {}, weapon: "broadsword", loadout: {q:"strike",w:"cyclone",p:"deepcuts"}, autoCount: 0, chargeExpiresAt: 0, pendingAttack: null };
  players.set(id, p);
  send(ws, { type: "welcome", id, player: publicPlayer(p), team:p.team, players: snapshot(p), resources: resourceWorldSnapshot(p), factories:factoryWorldSnapshot(p) });
  broadcast({ type: "joined", player: publicPlayer(p) }, id);

  ws.on("message", raw => {
    if (raw.length > 2048) return;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "hello") {
      p.name = safeName(msg.name);
      broadcast({ type: "player", player: publicPlayer(p) }, p.id);
      send(ws, { type: "welcome", id, player: publicPlayer(p), team:p.team, players: snapshot(p), resources: resourceWorldSnapshot(p), factories:factoryWorldSnapshot(p) });
      return;
    }
    if (msg.type === "latency-ping") {
      const sentAt = Number(msg.sentAt);
      if (Number.isFinite(sentAt)) send(ws, { type: "latency-pong", sentAt });
      return;
    }
    if (msg.type === "economy-get") { sendEconomy(p, ""); return; }
    if (msg.type === "economy-gather") {
      const kind = String(msg.resource || ""), nodeId = String(msg.nodeId || ""), requestId = String(msg.requestId || "").slice(0, 80);
      const node = worldResources.find(n => n.id === nodeId);
      const now = Date.now();
      if (!node || node.kind !== kind || p.hp <= 0 || isRiverBlocked(node.x, node.z) || Math.hypot(p.x - node.x, p.z - node.z) > 3.6) {
        sendEconomy(p, "Подойди ближе к доступному ресурсу.", {action:"gather",requestId,ok:false,nodeId}); return;
      }
      if (node.depleted || now - node.lastGatherAt < 2500) {
        sendEconomy(p, "Этот ресурс уже добывают или он восстанавливается.", {action:"gather",requestId,ok:false,nodeId}); return;
      }
      node.lastGatherAt = now;
      node.depleted = true;
      node.respawnAt = now + RESOURCE_RESPAWN_MS;
      p.economy.items[kind] = (p.economy.items[kind] || 0) + RESOURCE_YIELDS[kind];
      broadcastResource(node);
      sendEconomy(p, `+${RESOURCE_YIELDS[kind]} ${kind === "wood" ? "древесины" : kind === "stone" ? "камня" : "руды"}`, {action:"gather",requestId,ok:true,resource:kind,nodeId,respawnAt:node.respawnAt});
      return;
    }
    if (msg.type === "economy-craft") {
      const recipeId = String(msg.recipe || ""), recipe = ECONOMY_RECIPES[recipeId];
      if (!recipe) { sendEconomy(p, "Этот рецепт отключён."); return; }
      const activeFactory = getActiveFactory(p);
      if (!activeFactory || activeFactory.type !== recipe.station || activeFactory.running) { sendEconomy(p, `Подойди к свободной фабрике «${FACTORY_TYPES[recipe.station]?.name || recipe.station}» и открой её меню.`); return; }
      if (!startFactoryJob(p, activeFactory)) { sendEconomy(p, "Не хватает материалов для производства."); return; }
      sendEconomy(p, `Запущено производство: ${recipe.name}`);
      return;
    }
    if (msg.type === "economy-build") {
      const type = String(msg.factory || ""), def = FACTORY_TYPES[type], items = p.economy.items;
      if (!def) { sendEconomy(p, "Неизвестный тип фабрики."); return; }
      if (p.economy.factories.length >= 8) { sendEconomy(p, "Можно построить не более 8 фабрик."); return; }
      const x=Number(msg.x), z=Number(msg.z);
      if (!Number.isFinite(x)||!Number.isFinite(z)||Math.hypot(p.x-x,p.z-z)>18||!factoryPlacementClear(x,z)) { sendEconomy(p, "Здесь нельзя разместить фабрику: выбери свободное место на суше подальше от построек."); return; }
      if (!hasItems(items, def.cost)) { sendEconomy(p, "Не хватает ресурсов для строительства."); return; }
      takeItems(items, def.cost);
      const factory = { id:nextWorldFactoryId++, type, recipe:def.recipe, ownerId:p.id, ownerName:p.name, team:p.team, x, z, hp:600, buildingUntil:Date.now()+5000, buildingDuration:5000, running:false, startedAt:0, duration:0 };
      p.economy.factories.push(factory); worldFactories.push(factory);
      broadcast({type:"factory-created",factory:publicFactory(factory)});
      sendEconomy(p, `Начато строительство: ${def.name}`, {factory:publicFactory(factory)});
      return;
    }
    if (msg.type === "economy-open-factory") {
      const id=Number(msg.factoryId), factory=worldFactories.find(f=>f.id===id);
      if (!factory || factory.ownerId!==p.id || !factoryReady(factory) || !factoryNear(p,factory)) { send(ws,{type:"factory-menu-closed",message:"Подойди ближе к своей готовой фабрике."}); return; }
      p.activeFactoryId=factory.id; sendEconomy(p, `Открыта: ${factory.name}`, {activeFactoryId:factory.id}); return;
    }
    if (msg.type === "economy-close-factory") { p.activeFactoryId=null; sendEconomy(p,"Меню фабрики закрыто."); return; }
    if (msg.type === "economy-run") {
      const id = Number(msg.factoryId), factory = p.economy.factories.find(f => f.id === id);
      if (!factory || p.activeFactoryId!==factory.id || !factoryReady(factory) || !factoryNear(p,factory)) { sendEconomy(p, "Подойди к своей готовой фабрике и открой её меню."); return; }
      if (factory.running) { sendEconomy(p, "Фабрика уже работает."); return; }
      if (!startFactoryJob(p, factory)) { sendEconomy(p, "Не хватает материалов для производства."); return; }
      sendEconomy(p, "Производство запущено.");
      return;
    }
    if (msg.type === "economy-stop") {
      const id = Number(msg.factoryId), factory = p.economy.factories.find(f => f.id === id);
      if (!factory || p.activeFactoryId!==factory.id || !factoryReady(factory) || !factoryNear(p,factory) || !factory.running) { sendEconomy(p, "Нет доступного активного производства."); return; }
      const recipe = ECONOMY_RECIPES[factory.recipe];
      if (recipe) addItems(p.economy.items, recipe.inputs);
      factory.running = false; factory.startedAt = 0; factory.duration = 0;
      sendEconomy(p, "Производство отменено, материалы возвращены.");
      return;
    }
    if (msg.type === "factory-damage") {
      const id=Number(msg.factoryId), factory=worldFactories.find(f=>f.id===id);
      if (!factory || factory.team===p.team || p.hp<=0 || Math.hypot(p.x-factory.x,p.z-factory.z)>6.2) return;
      factory.hp=Math.max(0,factory.hp-100);
      if (factory.hp<=0) {
        const owner=players.get(factory.ownerId);
        if(owner?.economy) owner.economy.factories=owner.economy.factories.filter(f=>f.id!==factory.id);
        worldFactories.splice(worldFactories.indexOf(factory),1);
        for(const player of players.values()) if(player.activeFactoryId===factory.id){player.activeFactoryId=null;send(player.ws,{type:"factory-menu-closed",message:"Фабрика уничтожена."});}
        broadcast({type:"factory-destroyed",factoryId:factory.id,byTeam:p.team});
        if(owner)sendEconomy(owner,"Фабрика уничтожена. Незавершённые материалы потеряны.");
      } else broadcast({type:"factory-damaged",factory:publicFactory(factory)});
      return;
    }
    if (msg.type === "state") {
      if (p.hp <= 0) return;
      const x = Number(msg.x), z = Number(msg.z), rotation = Number(msg.rotation);
      if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotation)) return;
      if (Math.abs(x) > WORLD_BOUND || Math.abs(z) > WORLD_BOUND) return;
      // Reject client position updates inside the river; bridges are the only crossing points.
      if (isRiverBlocked(x, z)) { send(ws, { type: "player", player: publicPlayer(p) }); return; }
      // Crowd control and dash locks are server-authoritative; clients may update facing but not position;
      const movementLocked = ["root","parryLock","air","stun"].some(key => p.statuses?.[key]?.until > Date.now()) || (p.positionLockUntil && p.positionLockUntil > Date.now());
      if (movementLocked) {
        p.rotation = rotation;
        send(ws, { type: "player", player: publicPlayer(p) });
        broadcast({ type: "player", player: publicPlayer(p) }, p.id);
        return;
      }
      if (p.pendingAttack && Math.hypot(x - p.pendingAttack.startX, z - p.pendingAttack.startZ) > 0.12) {
        clearTimeout(p.pendingAttack.timer);
        const cancelledAttack = p.pendingAttack;
        p.pendingAttack = null;
        broadcast({type:"combat-cancelled",attackerId:p.id,targetId:cancelledAttack.targetId,attackId:cancelledAttack.id});
      }
      p.x = x; p.z = z; p.rotation = rotation;
      sendVisionSnapshot(p);
      if (p.activeFactoryId) { const active=worldFactories.find(f=>f.id===p.activeFactoryId); if(!factoryNear(p,active)){p.activeFactoryId=null;send(ws,{type:"factory-menu-closed",message:"Ты отошёл от фабрики. Меню закрыто."});} }
      broadcast({ type: "player", player: publicPlayer(p) }, p.id);
      return;
    }
    if (msg.type === "test-mode") { p.testMode = ALLOW_TEST_MODE && msg.enabled === true; if (p.testMode) { p.energy = 100; p.abilityCooldowns = {}; } send(ws, {type:"test-mode", enabled:p.testMode, energy:p.energy}); return; }
    if (msg.type === "weapon") {
      const weapon = String(msg.weapon || "");
      if (WEAPON_DAMAGE[weapon]) {
        p.weapon = weapon;
        p.branch = ALBION_WEAPONS[weapon]?.branch || null;
        if (p.branch) {
          const branch = ALBION_BRANCHES[p.branch], passiveIds = Object.keys(branch.passives);
          p.loadout = {
            q: branch.q.includes(p.loadout?.q) ? p.loadout.q : branch.q[0],
            w: branch.w.includes(p.loadout?.w) ? p.loadout.w : branch.w[0],
            p: passiveIds.includes(p.loadout?.p) ? p.loadout.p : passiveIds[0]
          };
        } else {
          p.loadout = {
            q: ["strike","cleave"].includes(p.loadout?.q) ? p.loadout.q : "strike",
            w: ["cyclone","interrupt","splitting","hamstring","parry","ironwill"].includes(p.loadout?.w) ? p.loadout.w : "cyclone",
            p: ["deepcuts","weakening","heroicfighting","increaseddef"].includes(p.loadout?.p) ? p.loadout.p : "deepcuts"
          };
        }
        send(ws, { type: "combat-loadout", weapon: p.weapon, branch: p.branch, loadout: p.loadout });
      }
      return;
    }
    if (msg.type === "loadout") {
      const q = String(msg.q || ""), w = String(msg.w || ""), passive = String(msg.p || "deepcuts");
      const branchId = ALBION_WEAPONS[p.weapon]?.branch || null, branch = branchId ? ALBION_BRANCHES[branchId] : null;
      const valid = branch
        ? branch.q.includes(q) && branch.w.includes(w) && Object.hasOwn(branch.passives, passive)
        : ["strike","cleave"].includes(q) && ["cyclone","interrupt","splitting","hamstring","parry","ironwill"].includes(w) && ["deepcuts","weakening","heroicfighting","increaseddef"].includes(passive);
      if (valid) p.loadout = {q,w,p:passive};
      else send(ws, { type: "combat-loadout", result: "invalid-loadout", branch: branchId, loadout: p.loadout });
      return;
    }
    if (msg.type === "stop") {
      p.input.x = 0; p.input.z = 0; p.moveTarget = null;
      return;
    }
    if (msg.type === "move-target") {
      if (p.hp <= 0) return;
      const x = Number(msg.x), z = Number(msg.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (Math.hypot(x,z) > WORLD_BOUND) return;
      p.moveTarget = {x,z};
      p.input.x = 0; p.input.z = 0;
      return;
    }
    if (msg.type === "attack") {
      const now = Date.now();
      if (p.hp <= 0 || p.statuses?.stun || p.statuses?.air || (p.statuses?.cannotAttack && p.statuses.cannotAttack.until > now) || now - p.lastAttack < ATTACK_COOLDOWN_MS / (1 + Math.max(0,Number(p.statuses?.attackSpeed?.value)||0)) || p.pendingAttack) return;
      const target = players.get(String(msg.targetId || ""));
      if (!target || target.id === p.id || target.hp <= 0 || target.team === p.team) return;
      const distance = Math.hypot(target.x - p.x, target.z - p.z);
      if (!Number.isFinite(distance) || distance > ATTACK_RANGE) {
        send(ws, { type: "combat", result: "out-of-range", targetId: target.id });
        return;
      }
      if (isCombatInvulnerable(target, now, false)) return;
      const attackId = crypto.randomUUID(), startX = p.x, startZ = p.z;
      p.pendingAttack = { id: attackId, targetId: target.id, startX, startZ, timer: null };
      broadcast({ type: "combat-windup", attackerId: p.id, targetId: target.id, attackId, weapon: p.weapon || "broadsword", duration: 320 });
      p.pendingAttack.timer = setTimeout(() => {
        if (!p.pendingAttack || p.pendingAttack.id !== attackId) return;
        p.pendingAttack = null;
        const now = Date.now();
        if (p.hp <= 0 || p.statuses?.stun || p.statuses?.air ||
            Math.hypot(p.x - startX, p.z - startZ) > 0.12 ||
            target.hp <= 0 || Math.hypot(target.x - p.x, target.z - p.z) > ATTACK_RANGE ||
            isParryInvulnerable(target, now)) {
          broadcast({ type: "combat-cancelled", attackerId: p.id, targetId: target.id, attackId });
          return;
        }
      const weapon = p.weapon || "broadsword";
      const baseDamage = WEAPON_DAMAGE[weapon] || WEAPON_DAMAGE.broadsword;
      const outgoingWeak = p.statuses?.weak && p.statuses.weak.until > now ? Math.max(0, Math.min(.9, Number(p.statuses.weak.value) || 0)) : 0;
      const attackBonus = ["attackBuff","interruptAttackBuff","bloodthirstAttackBuff","damageBuff"].reduce((sum,key) => { const st=p.statuses?.[key]; return sum + (st && st.until > now ? Math.max(0,Number(st.value)||0) : 0); }, 0);
      const damage = Math.round(baseDamage * (1 + attackBonus) * (1 - outgoingWeak) * (target.statuses?.armorBreak ? 1.25 : 1));
      const defense = target.statuses?.defense && target.statuses.defense.until > now ? Math.max(0, Number(target.statuses.defense.value) || 0) : 0;
      const defenseReduction = defense > 0 ? Math.min(.5, defense / (defense + 200)) : 0;
      const dealt = Math.max(0, Math.round(damage * (1 - (target.statuses?.resist?.value || 0)) * (1 - defenseReduction)));
      p.lastAttack = now;
      p.autoCount = (p.autoCount || 0) + 1;
      const passive = ALBION_PASSIVES[p.loadout?.p];
      if (passive && ALBION_WEAPONS[p.weapon]?.branch === passive.branch && p.autoCount % Math.max(1,Number(passive.everyNthAutoAttack)||1) === 0) {
        if (passive.effect) applyEffects(target,[passive.effect],p.id);
        if (passive.selfEffect) applyEffects(p,[passive.selfEffect],p.id);
      }
      if (p.loadout?.p === "deepcuts" && p.autoCount % 4 === 0) target.statuses.deepBleed = {value:53,until:now+1500,nextTickAt:now+500,sourceId:p.id};
      if (p.loadout?.p === "weakening") target.statuses.weak = {value:.04,until:now+2000,sourceId:p.id};
      if (p.loadout?.p === "heroicfighting" && p.autoCount % 4 === 0) { p.charges = Math.min(3,(p.charges||0)+1); p.chargeExpiresAt = now + 6000; broadcast({type:"player",player:publicPlayer(p)},p.id); }
      if (p.loadout?.p === "increaseddef" && p.autoCount % 5 === 0) { p.statuses.defense = {value:68,until:now+2000,sourceId:p.id}; broadcast({type:"combat-status",targetId:p.id,statuses:p.statuses}); }
      if (p.statuses?.bloodthirst && p.statuses.bloodthirst.until > now) {
        const existingBleed = target.statuses.bleed;
        const existingActive = existingBleed && existingBleed.until > now;
        target.statuses.bleed = {
          value: 60,
          until: Math.max(existingActive ? existingBleed.until : 0, now + 2000),
          nextTickAt: existingActive && Number.isFinite(existingBleed.nextTickAt) ? existingBleed.nextTickAt : now + 500,
          sourceId: p.id
        };
      }
      const actualDealt = absorbShield(target, dealt);
      target.hp = Math.max(0, target.hp - actualDealt);
      const autoLeech = p.statuses?.lifestealAuto;
      if (actualDealt > 0 && autoLeech && autoLeech.until > now) p.hp = Math.min(PLAYER_MAX_HP, p.hp + Math.round(actualDealt * (Number(autoLeech.value)||0)));
      broadcast({type:"combat-status",targetId:target.id,statuses:target.statuses});
      send(ws,{type:"combat-resource",energy:p.energy,charges:p.charges||0,chargeExpiresAt:p.chargeExpiresAt||0,statuses:p.statuses||{}});
      broadcast({ type: "combat-hit", attackerId: p.id, targetId: target.id, damage: actualDealt, hp: target.hp, kind: "auto" });
      broadcast({ type: "player", player: publicPlayer(target) });
      if (target.hp === 0) scheduleRespawn(target);
      }, 320);
      return;
    }
    if (msg.type === "ability-hit") {
      const now=Date.now();
      if(p.hp<=0)return;
      if(p.statuses?.silence||p.statuses?.stun||p.statuses?.air){send(ws,{type:"combat",result:"disabled",abilityId:String(msg.abilityId||""),energy:p.energy});return;}
      if(now-p.lastAbility<250)return;
      const targetId=String(msg.targetId||""),target=targetId?players.get(targetId):null,slot=String(msg.slot||""),weapon=p.weapon||"broadsword";
      const abilityId=String(msg.abilityId||(slot==="e"?WEAPON_E[weapon]:"")),ability=ABILITIES[abilityId]||ALBION_SPELLS[abilityId];
      if (ALBION_SPELLS[abilityId]) { handleAlbionAbility(p, ws, msg, ALBION_SPELLS[abilityId], abilityId, slot); return; }
      const areaAbilityIds=new Set(["cleave","cyclone","splitting","parry","spinning","bloodthirsty","carvingDash","soulless","majestic","infinity"]);
      const selfAbilityIds=new Set(["ironwill"]);
      const needsTarget=!areaAbilityIds.has(abilityId)&&!selfAbilityIds.has(abilityId);
      if(!ability||!ABILITY_IDS.has(abilityId)||(needsTarget&&(!target||target.id===p.id||target.hp<=0||target.team===p.team)))return;
      if(target&&(target.id===p.id||target.hp<=0||target.team===p.team))return;
      if(!["q","w","e"].includes(slot))return;
      if(slot==="e"&&WEAPON_E[weapon]!==abilityId)return;
      if(slot==="q"&&p.loadout.q!==abilityId)return;
      if(slot==="w"&&p.loadout.w!==abilityId)return;
      if(!p.testMode && (p.abilityCooldowns[abilityId]||0)>now){send(ws,{type:"combat",result:"cooldown",abilityId,until:p.abilityCooldowns[abilityId],energy:p.energy});return;}
      if(!p.testMode && p.energy < ability.cost){send(ws,{type:"combat",result:"energy",abilityId,energy:p.energy});return;}
      let dx=target?target.x-p.x:0,dz=target?target.z-p.z:0,distance=target?Math.hypot(dx,dz):Infinity;
      const aimX=Number(msg.aimX),aimZ=Number(msg.aimZ);
      if(!needsTarget&&!selfAbilityIds.has(abilityId)&&(!Number.isFinite(aimX)||!Number.isFinite(aimZ))){send(ws,{type:"combat",result:"invalid-aim",abilityId,energy:p.energy});return;}
      const castOriginX=p.x,castOriginZ=p.z;
      const isArea=Number.isFinite(aimX)&&Number.isFinite(aimZ)&&["cleave","cyclone","splitting","parry","spinning","bloodthirsty","carvingDash","soulless","majestic","infinity"].includes(abilityId);
      const selfCentered = ["cleave","parry","majestic"].includes(abilityId);
      if(abilityId==="ironwill"){if(!p.testMode){p.energy-=ability.cost;p.abilityCooldowns[abilityId]=now+ability.cooldown*1000;}applyEffects(p,ability.selfEffects||[],p.id);broadcast({type:"combat-effect",attackerId:p.id,abilityId,targetIds:[p.id],x:p.x,z:p.z});p.lastAbility=now;send(ws,{type:"combat-resource",energy:p.energy,abilityId,cooldownUntil:p.abilityCooldowns[abilityId],charges:p.charges||0,chargeExpiresAt:p.chargeExpiresAt||0,statuses:p.statuses||{}});return;}
      if(ability.dash&&distance<=ability.range&&distance>1.35){
        const travel=Math.min(distance-1.05,abilityId==="charge"?12:Math.max(2.7,distance-1.7));
        p.rotation=Math.atan2(dx,dz);
        const dashLanding = safeLandPosition(p.x, p.z, Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,p.x+dx/distance*travel)), Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,p.z+dz/distance*travel)));
        p.x = dashLanding.x; p.z = dashLanding.z;
        p.positionLockUntil = Date.now() + 250;
        distance=Math.hypot(target.x-p.x,target.z-p.z);
        // Replicate server-authoritative dash immediately so clients render the jump, not only the impact.
        broadcast({type:"player",player:publicPlayer(p)});
      }
      if((abilityId==="spinning"||abilityId==="carvingDash"||abilityId==="cyclone")&&Number.isFinite(aimX)&&Number.isFinite(aimZ)){
        const maxTravel=abilityId==="spinning"?12:abilityId==="carvingDash"?6:7,ax=aimX-p.x,az=aimZ-p.z,len=Math.hypot(ax,az);
        // Clamp cursor aim to the ability's travel distance instead of silently dropping the cast.
        const travel=Math.min(maxTravel,len);
        if(len>.01){const dashLanding=safeLandPosition(p.x,p.z,Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,p.x+ax/len*travel)),Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,p.z+az/len*travel)));p.x=dashLanding.x;p.z=dashLanding.z;p.rotation=Math.atan2(ax,az);p.positionLockUntil=Date.now()+250;}
      }
      let victims=[];
      if(ability.path&&isArea){
        const vx=p.x-castOriginX,vz=p.z-castOriginZ,l=Math.hypot(vx,vz)||1,ux=vx/l,uz=vz/l;
        victims=[...players.values()].filter(t=>t.hp>0&&t.id!==p.id&&t.team!==p.team&&(()=>{const rx=t.x-castOriginX,rz=t.z-castOriginZ,along=rx*ux+rz*uz,side=Math.abs(rx*uz-rz*ux);return along>=0&&along<=l&&side<=ability.radius;})());
      } else if(ability.radius&&isArea){
        // Spinning lands at the server-clamped dash endpoint; resolve its hit circle there, not at a farther cursor point.
        const landingCentered=abilityId==="spinning";
        const ax=selfCentered||landingCentered?p.x:Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,aimX)),az=selfCentered||landingCentered?p.z:Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,aimZ));
        if(!selfCentered&&!["bloodthirsty","infinity"].includes(abilityId)&&Math.hypot(ax-castOriginX,az-castOriginZ)>(ability.range||7)+1)return;
        if(["bloodthirsty","infinity"].includes(abilityId)){
          const dx=aimX-castOriginX,dz=aimZ-castOriginZ,len=Math.hypot(dx,dz),ux=len>.3?dx/len:Math.sin(p.rotation),uz=len>.3?dz/len:Math.cos(p.rotation);
          victims=[...players.values()].filter(t=>{if(t.hp<=0||t.id===p.id||t.team===p.team)return false;const rx=t.x-castOriginX,rz=t.z-castOriginZ,d=Math.hypot(rx,rz);return d<=ability.radius&&(d<.3||(rx/d)*ux+(rz/d)*uz>=Math.cos(.8));});
        } else victims=[...players.values()].filter(t=>t.hp>0&&t.id!==p.id&&t.team!==p.team&&Math.hypot(t.x-ax,t.z-az)<=ability.radius);
      }
      else if(ability.line){
        const ox=castOriginX,oz=castOriginZ,tx=Number.isFinite(aimX)?aimX:(target?.x??castOriginX),tz=Number.isFinite(aimZ)?aimZ:(target?.z??castOriginZ);
        const vx=tx-ox,vz=tz-oz,l=Math.hypot(vx,vz),ux=l>.01?vx/l:Math.sin(p.rotation),uz=l>.01?vz/l:Math.cos(p.rotation),len=ability.line;
        victims=[...players.values()].filter(t=>t.hp>0&&t.id!==p.id&&t.team!==p.team&&(()=>{const rx=t.x-ox,rz=t.z-oz,a=rx*ux+rz*uz,side=Math.abs(rx*uz-rz*ux);return a>=0&&a<=len&&side<=1.5;})());
      }
      else {if(!target){send(ws,{type:"combat",result:"no-target",abilityId,energy:p.energy});return;}if(distance>(ability.range||4)){send(ws,{type:"combat",result:"out-of-range",targetId:target.id,abilityId,energy:p.energy});return;}victims=[target];}
      if(!victims.length && !areaAbilityIds.has(abilityId)){send(ws,{type:"combat",result:"no-target",targetId:target?.id,abilityId,energy:p.energy});return;}
      p.lastAbility=now;if(!p.testMode){p.energy-=ability.cost;p.abilityCooldowns[abilityId]=now+ability.cooldown*1000;}
      send(ws,{type:"combat-resource",energy:p.energy,abilityId,cooldownUntil:p.abilityCooldowns[abilityId]||0,charges:p.charges||0,chargeExpiresAt:p.chargeExpiresAt||0,statuses:p.statuses||{}});
      if(abilityId==="parry"){
        applyEffects(p,ability.selfEffects||[],p.id);
        p.statuses.parryLock={value:true,until:now+800,sourceId:p.id};
        broadcast({type:"combat-status",targetId:p.id,statuses:p.statuses});
        send(ws,{type:"combat-resource",energy:p.energy,abilityId,cooldownUntil:p.abilityCooldowns[abilityId]||0,charges:p.charges||0,chargeExpiresAt:p.chargeExpiresAt||0,statuses:p.statuses||{}});
        setTimeout(()=>{
          if(p.hp<=0)return;
          const impactVictims=[...players.values()].filter(t=>t.hp>0&&t.id!==p.id&&t.team!==p.team&&!isParryInvulnerable(t)&&Math.hypot(t.x-p.x,t.z-p.z)<=6);
          for(const victim of impactVictims){
            const reduction=victim.statuses?.resist?.value||0;
            const defense=victim.statuses?.defense&&victim.statuses.defense.until>Date.now()?Math.max(0,Number(victim.statuses.defense.value)||0):0;
            const defenseReduction=defense>0?Math.min(.5,defense/(defense+200)):0;
            const outgoingWeak=p.statuses?.weak&&p.statuses.weak.until>Date.now()?Math.max(0,Math.min(.9,Number(p.statuses.weak.value)||0)):0;
            const vulnerability=victim.statuses?.armorBreak&&victim.statuses.armorBreak.until>Date.now()?(1+Math.max(0,Number(victim.statuses.armorBreak.value)||0)):1;
            const dealt=Math.max(0,Math.round(80*(1-reduction)*(1-defenseReduction)*(1-outgoingWeak)*vulnerability));
            const actual=absorbShield(victim,dealt);victim.hp=Math.max(0,victim.hp-actual);
            broadcast({type:"combat-hit",attackerId:p.id,targetId:victim.id,damage:actual,hp:victim.hp,kind:"ability",slot,abilityId,hitIndex:0});
            if(victim.hp>0)applyEffects(victim,ability.effects||[],p.id);
            if(victim.hp===0&&!victim.respawnTimer)scheduleRespawn(victim);
            broadcast({type:"player",player:publicPlayer(victim)});
          }
          broadcast({type:"combat-effect",phase:"impact",attackerId:p.id,abilityId,targetIds:impactVictims.map(v=>v.id),x:p.x,z:p.z,originX:p.x,originZ:p.z,aimX:p.x,aimZ:p.z,rotation:p.rotation,charges:p.charges||0,weapon:p.weapon||"broadsword"});
          broadcast({type:"player",player:publicPlayer(p)});
        },800);
        broadcast({type:"combat-effect",phase:"cast",attackerId:p.id,abilityId,targetIds:[],x:p.x,z:p.z,originX:p.x,originZ:p.z,aimX:p.x,aimZ:p.z,rotation:p.rotation,charges:p.charges||0,weapon:p.weapon||"broadsword"});
        broadcast({type:"player",player:publicPlayer(p)});
        return;
      }
      let castDamage=ability.damage;
      if(abilityId==="mightyBlow")castDamage=[269,432,649,918][Math.min(3,p.charges||0)];
      if(abilityId==="charge")castDamage=[390,560,780,1030][Math.min(3,p.charges||0)];
      if(abilityId==="carvingDash")castDamage=[260,340,430,540][Math.min(3,p.charges||0)];
      if(abilityId==="cyclone"&&(p.charges||0)>0){castDamage=162;p.charges--;if(p.charges<=0)p.chargeExpiresAt=0;}
      if(["mightyBlow","charge","carvingDash"].includes(abilityId)){p.charges=0;p.chargeExpiresAt=0;}
      for(const victim of victims){
        if(isParryInvulnerable(victim)) continue;
        if(abilityId==="majestic"){
          const reduction=victim.statuses?.resist?.value||0;
          const defense=victim.statuses?.defense&&victim.statuses.defense.until>Date.now()?Math.max(0,Number(victim.statuses.defense.value)||0):0;
          const defenseReduction=defense>0?Math.min(.5,defense/(defense+200)):0;
          const outgoingWeak=p.statuses?.weak&&p.statuses.weak.until>Date.now()?Math.max(0,Math.min(.9,Number(p.statuses.weak.value)||0)):0;
          const vulnerability=victim.statuses?.armorBreak&&victim.statuses.armorBreak.until>Date.now()?(1+Math.max(0,Number(victim.statuses.armorBreak.value)||0)):1;
          const firstDamage=Math.max(0,Math.round(castDamage*(1-reduction)*(1-defenseReduction)*(1-outgoingWeak)*vulnerability));
          const firstActual=absorbShield(victim,firstDamage);victim.hp=Math.max(0,victim.hp-firstActual);
          broadcast({type:"combat-hit",attackerId:p.id,targetId:victim.id,damage:firstActual,hp:victim.hp,kind:"ability",slot,abilityId,hitIndex:0});
          if(victim.hp>0)applyEffects(victim,ability.effects||[],p.id);
          if(victim.hp===0&&!victim.respawnTimer)scheduleRespawn(victim);
          else setTimeout(()=>{
            // The second swing is a separate impact: only hit targets still inside the original cast circle.
            if(victim.hp<=0 || isCombatInvulnerable(victim,Date.now(),true) || Math.hypot(victim.x-castOriginX,victim.z-castOriginZ)>(ability.radius||0))return;
            const reduction2=victim.statuses?.resist?.value||0;
            const defense2=victim.statuses?.defense&&victim.statuses.defense.until>Date.now()?Math.max(0,Number(victim.statuses.defense.value)||0):0;
            const defenseReduction2=defense2>0?Math.min(.5,defense2/(defense2+200)):0;
            const outgoingWeak2=p.statuses?.weak&&p.statuses.weak.until>Date.now()?Math.max(0,Math.min(.9,Number(p.statuses.weak.value)||0)):0;
            const vulnerability2=victim.statuses?.armorBreak&&victim.statuses.armorBreak.until>Date.now()?(1+Math.max(0,Number(victim.statuses.armorBreak.value)||0)):1;
            const secondDamage=Math.max(0,Math.round((ability.secondDamage||480)*(1-reduction2)*(1-defenseReduction2)*(1-outgoingWeak2)*vulnerability2));
            const secondActual=absorbShield(victim,secondDamage);victim.hp=Math.max(0,victim.hp-secondActual);
            broadcast({type:"combat-hit",attackerId:p.id,targetId:victim.id,damage:secondActual,hp:victim.hp,kind:"ability",slot,abilityId,hitIndex:1});
            if(victim.hp===0&&!victim.respawnTimer)scheduleRespawn(victim);
            broadcast({type:"combat-effect",phase:"impact",attackerId:p.id,abilityId,targetIds:[victim.id],x:castOriginX,z:castOriginZ,originX:castOriginX,originZ:castOriginZ,aimX:castOriginX,aimZ:castOriginZ,rotation:p.rotation,charges:p.charges||0,weapon:p.weapon||"kingmaker",hitIndex:1});
            broadcast({type:"player",player:publicPlayer(victim)});
          },950);
          continue;
        }
        for(let hit=0;hit<(ability.hits||1);hit++){const amount=hit===(ability.hits||1)-1&&ability.secondDamage?ability.secondDamage:castDamage;const reduction=victim.statuses?.resist?.value||0;const defense=victim.statuses?.defense&&victim.statuses.defense.until>Date.now()?Math.max(0,Number(victim.statuses.defense.value)||0):0;const defenseReduction=defense>0?Math.min(.5,defense/(defense+200)):0;const outgoingWeak=p.statuses?.weak&&p.statuses.weak.until>Date.now()?Math.max(0,Math.min(.9,Number(p.statuses.weak.value)||0)):0;const vulnerability=victim.statuses?.armorBreak&&victim.statuses.armorBreak.until>Date.now()?(1+Math.max(0,Number(victim.statuses.armorBreak.value)||0)):1;const dealt=Math.max(0,Math.round(amount*(1-reduction)*(1-defenseReduction)*(1-outgoingWeak)*vulnerability));const actual=absorbShield(victim,dealt);victim.hp=Math.max(0,victim.hp-actual);broadcast({type:"combat-hit",attackerId:p.id,targetId:victim.id,damage:actual,hp:victim.hp,kind:"ability",slot,abilityId,hitIndex:hit});if(victim.hp<=0)break;}
        if(victim.hp>0)applyEffects(victim,ability.effects||[],p.id);
        if(victim.hp===0&&!victim.respawnTimer)scheduleRespawn(victim);
      }
      if(ability.selfEffects && (victims.length || ["parry","bloodthirsty"].includes(abilityId))){
        const selfEffects=abilityId==="cleave"?ability.selfEffects.map(e=>e.type==="charge"?{...e,amount:victims.length>=3?2:1}:e):abilityId==="interrupt"?(ability.selfEffects||[]).map(e=>e.type==="interruptAttackBuff"?{...e,value:.2*Math.min(3,Math.max(0,p.charges||0))}:e):ability.selfEffects;
        applyEffects(p,selfEffects,p.id);
      }
      send(ws,{type:"combat-resource",energy:p.energy,abilityId,cooldownUntil:p.abilityCooldowns[abilityId]||0,charges:p.charges||0,chargeExpiresAt:p.chargeExpiresAt||0,statuses:p.statuses||{}});
      let effectAimX=selfCentered?p.x:(Number.isFinite(aimX)?aimX:p.x),effectAimZ=selfCentered?p.z:(Number.isFinite(aimZ)?aimZ:p.z);
      if(abilityId==="splitting"){
        let vx=effectAimX-castOriginX,vz=effectAimZ-castOriginZ,len=Math.hypot(vx,vz);
        if(len<=.01){vx=Math.sin(p.rotation);vz=Math.cos(p.rotation);len=1;}
        effectAimX=Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,castOriginX+vx/len*ability.line));
        effectAimZ=Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,castOriginZ+vz/len*ability.line));
      }
      broadcast({type:"combat-effect",attackerId:p.id,abilityId,targetIds:victims.map(v=>v.id),x:p.x,z:p.z,originX:castOriginX,originZ:castOriginZ,aimX:effectAimX,aimZ:effectAimZ,rotation:p.rotation,charges:p.charges||0,weapon:p.weapon||"broadsword"});
      broadcast({type:"player",player:publicPlayer(p)});
      for(const victim of victims)broadcast({type:"player",player:publicPlayer(victim)});
    }
  });
  ws.on("close", () => {
    players.delete(id);
    broadcast({ type: "left", id });
  });
  ws.on("error", () => {});
});

const heartbeat = setInterval(() => {
  for (const p of players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) send(p.ws, { type: "ping", online: players.size });
  }
}, 15000);
const gameTick = setInterval(() => {
  const resourceNow = Date.now();
  for (const node of worldResources) {
    if (node.depleted && node.respawnAt && node.respawnAt <= resourceNow) {
      node.depleted = false; node.respawnAt = 0;
      broadcastResource(node);
    }
  }
  const dt = TICK_MS / 1000;
  for (const p of players.values()) {
    p.energy = Math.min(100, (p.energy ?? 100) + 4 * dt);
    const now = Date.now();
    if (p.economy?.factories) {
      let economyChanged = false;
      for (const factory of p.economy.factories) if (factory.running && now >= factory.startedAt + factory.duration) {
        const recipe = ECONOMY_RECIPES[factory.recipe];
        if (recipe) addItems(p.economy.items, recipe.output);
        factory.running = false; factory.startedAt = 0; factory.duration = 0; economyChanged = true;
        // Keep the production line running while input materials remain.
        if (recipe && startFactoryJob(p, factory)) economyChanged = true;
      }
      if (economyChanged) sendEconomy(p, "Производство завершено.");
      else if (p.economy.factories.some(f => f.running) && now - (p.economy.lastUiUpdate || 0) >= 1000) sendEconomy(p, "");
    }
    if (!p.statuses) p.statuses = {};
    if ((p.charges || 0) > 0 && p.chargeExpiresAt && p.chargeExpiresAt <= now) {
      p.charges = 0; p.chargeExpiresAt = 0;
      send(p.ws,{type:"combat-resource",energy:p.energy,charges:0,chargeExpiresAt:0,statuses:p.statuses});
      broadcast({type:"player",player:publicPlayer(p)},p.id);
    }
    let statusExpired = false;
    for (const [key, status] of Object.entries(p.statuses)) {
      if (!status) { delete p.statuses[key]; statusExpired = true; continue; }
      if ((key === "bleed" || key === "deepBleed" || key === "axeBleed" || key === "moveBleed") && p.hp > 0) {
        if (key === "moveBleed") {
          const moved = Math.hypot(p.x-(status.lastX??p.x),p.z-(status.lastZ??p.z)) > 0.03;
          status.lastX=p.x;status.lastZ=p.z;
          if (!moved) status.nextTickAt=now+Math.max(100,Number(status.interval||0.5)*1000);
        }
        if (!Number.isFinite(status.nextTickAt)) status.nextTickAt = now + 500;
        while (status.nextTickAt <= now && status.nextTickAt <= status.until && p.hp > 0) {
          if (!isParryInvulnerable(p, now)) {
            const damage = Math.max(1, Math.round(key === "axeBleed" ? Number(status.value||14)*(Number(status.stacks)||1)*0.5 : key === "moveBleed" ? Number(status.value||67) : Number(status.value||60)*0.5));
            p.hp = Math.max(0, p.hp - damage);
            broadcast({type:"combat-hit",attackerId:status.sourceId,targetId:p.id,damage,hp:p.hp,kind:"dot",abilityId:key === "deepBleed" ? "deepcuts" : "bloodthirsty"});
            if (p.hp === 0) scheduleRespawn(p);
          }
          status.nextTickAt += 500;
        }
      }
      if (key === "healOverTime" && p.hp > 0) {
        if (!Number.isFinite(status.nextTickAt)) status.nextTickAt=now+Math.max(200,Number(status.interval||1)*1000);
        while(status.nextTickAt<=now&&status.nextTickAt<=status.until&&p.hp>0){
          if(!(p.statuses.healBlock&&p.statuses.healBlock.until>now))p.hp=Math.min(PLAYER_MAX_HP,p.hp+Math.max(0,Number(status.value)||0));
          status.nextTickAt+=Math.max(200,Number(status.interval||1)*1000);
        }
      }
      if (status.until <= now) { delete p.statuses[key]; statusExpired = true; }
    }
    if (statusExpired) broadcast({type:"combat-status",targetId:p.id,statuses:p.statuses});
  }
}, TICK_MS);
server.on("close", () => { clearInterval(heartbeat); clearInterval(gameTick); });
server.listen(PORT, HOST, () => console.log(`Game server listening on ${HOST}:${PORT}`));
