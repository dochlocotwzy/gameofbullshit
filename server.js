const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";
const GAME_FILE = path.join(__dirname, "villagestrategy_albion_prototype (2).html");
const MAX_PLAYERS = 40;
const PLAYER_MAX_HP = 1000;
const WEAPON_DAMAGE = { broadsword: 40, claymore: 58, dual: 44, clarent: 42, carving: 54, galatine: 46, kingmaker: 60, infinity: 44 };
const ABILITY_MULTIPLIER = { q: 2.2, w: 2.8, e: 3.5 };
const Q_ALLOWED = new Set(["strike","cleave"]);
const W_ALLOWED = new Set(["cyclone","interrupt","splitting","hamstring","parry","ironwill"]);
const WEAPON_E = { broadsword:"mightyBlow", claymore:"charge", dual:"spinning", clarent:"bloodthirsty", carving:"carvingDash", galatine:"soulless", kingmaker:"majestic", infinity:"infinity" };
const ABILITIES = {
 strike:{cost:6,cooldown:3,damage:249,range:3.2,selfEffects:[{type:"charge",amount:1},{type:"haste",value:.2,duration:3.5}]}, cleave:{cost:11,cooldown:3,damage:200,radius:6,selfEffects:[{type:"charge",amount:1},{type:"haste",value:.2,duration:5}]},
 cyclone:{cost:24,cooldown:10,damage:120,radius:2.4,hits:3,range:7,path:true}, interrupt:{cost:32,cooldown:10,damage:248,range:3.2,effects:[{type:"interrupt"}],selfEffects:[{type:"attackBuff",value:.2,duration:5}]},
 splitting:{cost:38,cooldown:15,damage:432,line:14,effects:[{type:"root",duration:1.25}]}, hamstring:{cost:32,cooldown:10,damage:192,range:3.2,effects:[{type:"slow",value:.38,duration:8}]},
 parry:{cost:9,cooldown:15,damage:80,radius:6,effects:[{type:"silence",duration:.8}],selfEffects:[{type:"resist",value:1,duration:.8}]}, ironwill:{cost:29,cooldown:20,self:true,selfEffects:[{type:"haste",value:.2,duration:4},{type:"resist",value:.259,duration:4}]},
 mightyBlow:{cost:35,cooldown:10,damage:269,range:10,dash:1.7,effects:[{type:"interrupt"}],selfEffects:[{type:"resist",value:.7,duration:3}]}, charge:{cost:16,cooldown:20,damage:390,range:13,dash:1.7,effects:[{type:"stun",duration:.8}]},
 spinning:{cost:20,cooldown:20,damage:500,radius:3.2,range:12,selfEffects:[{type:"haste",value:.5,duration:4},{type:"attackBuff",value:1,duration:4}]},
 bloodthirsty:{cost:14,cooldown:20,damage:260,radius:5,effects:[{type:"bleed",dps:60,duration:5}],selfEffects:[{type:"haste",value:.3,duration:6},{type:"attackBuff",value:.3,duration:6}]}, carvingDash:{cost:20,cooldown:14,damage:260,line:6.5,range:6,effects:[{type:"armorBreak",duration:5}]},
 soulless:{cost:28,cooldown:20,damage:150,radius:4.5,range:14,hits:3,effects:[{type:"hpDown",value:.15,duration:6}]}, majestic:{cost:30,cooldown:25,damage:330,radius:6,hits:2,secondDamage:480,effects:[{type:"air",duration:.9}]},
 infinity:{cost:25,cooldown:18,damage:210,radius:5,hits:3,secondDamage:380,effects:[{type:"slow",value:.3,duration:2}]}
};
const ABILITY_IDS = new Set(["strike","cleave","cyclone","interrupt","splitting","hamstring","parry","ironwill",...Object.values(WEAPON_E)]);
const ATTACK_RANGE = 3.8;
const ATTACK_COOLDOWN_MS = 850;
const MOVE_SPEED = 5.2;
const RUN_SPEED = 8.0;
const WORLD_BOUND = 57;
const TICK_MS = 50;
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
function snapshot() {
  return [...players.values()].map(p => ({
    id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, rotation: p.rotation, hp: p.hp, statuses: p.statuses || {}
  }));
}
function broadcast(payload, exceptId) {
  const message = JSON.stringify(payload);
  for (const p of players.values()) {
    if (p.id !== exceptId && p.ws.readyState === WebSocket.OPEN) p.ws.send(message);
  }
}
function publicPlayer(p) { return {id:p.id,name:p.name,x:p.x,y:0,z:p.z,rotation:p.rotation,hp:p.hp,statuses:p.statuses||{}}; }
function applyEffects(target,effects,sourceId) {
  if(!target.statuses)target.statuses={};
  for(const e of effects){if(e.type==="charge"){target.charges=Math.min(3,(target.charges||0)+(e.amount||1));continue;}
    if(e.type==="interrupt"){target.statuses.casting={value:false,until:Date.now()+500};continue;}
    const key=e.type,old=target.statuses[key]||{};
    target.statuses[key]={value:e.value??e.dps??true,until:Date.now()+Math.round((e.duration||1)*1000),sourceId};
  }
  broadcast({type:"combat-status",targetId:target.id,statuses:target.statuses});
}
function scheduleRespawn(target){if(target.respawnTimer)return;target.respawnTimer=setTimeout(()=>{target.hp=PLAYER_MAX_HP;target.x=0;target.z=7;target.statuses={};target.charges=0;target.respawnTimer=null;broadcast({type:"respawn",player:publicPlayer(target)});},5000);}
function safeName(value) {
  return String(value || "Player").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 18) || "Player";
}

wss.on("connection", (ws) => {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { type: "error", message: "Сервер заполнен." });
    return ws.close(1013, "Server full");
  }
  const id = crypto.randomUUID();
  const p = { id, ws, name: "Игрок", x: 0, y: 0, z: 7, rotation: 0, hp: PLAYER_MAX_HP, lastUpdate: 0, lastAttack: 0, lastAbility: 0, respawnTimer: null, input: {x:0,z:0,running:false}, moveTarget: null, statuses: {}, charges: 0, energy: 100, abilityCooldowns: {}, weapon: "broadsword", loadout: {q:"strike",w:"cyclone"} };
  players.set(id, p);
  send(ws, { type: "welcome", id, players: snapshot() });
  broadcast({ type: "joined", player: { id, name: p.name, x: p.x, y: p.y, z: p.z, rotation: p.rotation, hp: p.hp } }, id);

  ws.on("message", raw => {
    if (raw.length > 2048) return;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "hello") {
      p.name = safeName(msg.name);
      broadcast({ type: "player", player: { id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, rotation: p.rotation, hp: p.hp } }, p.id);
      send(ws, { type: "welcome", id, players: snapshot() });
      return;
    }
    if (msg.type === "input") {
      if (p.hp <= 0) return;
      const x = Number(msg.x), z = Number(msg.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      p.input.x = Math.max(-1, Math.min(1, x));
      p.input.z = Math.max(-1, Math.min(1, z));
      p.input.running = msg.running === true;
      p.moveTarget = null;
      return;
    }
    if (msg.type === "weapon") {
      const weapon = String(msg.weapon || "");
      if (WEAPON_DAMAGE[weapon]) p.weapon = weapon;
      return;
    }
    if (msg.type === "loadout") {
      const q = String(msg.q || ""), w = String(msg.w || "");
      if (Q_ALLOWED.has(q) && W_ALLOWED.has(w)) p.loadout = {q,w};
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
      if (p.hp <= 0 || p.statuses?.stun || p.statuses?.air || now - p.lastAttack < ATTACK_COOLDOWN_MS) return;
      const target = players.get(String(msg.targetId || ""));
      if (!target || target.id === p.id || target.hp <= 0) return;
      const distance = Math.hypot(target.x - p.x, target.z - p.z);
      if (!Number.isFinite(distance) || distance > ATTACK_RANGE) {
        send(ws, { type: "combat", result: "out-of-range", targetId: target.id });
        return;
      }
      const weapon = p.weapon || "broadsword";
      const baseDamage = WEAPON_DAMAGE[weapon] || WEAPON_DAMAGE.broadsword;
      const damage = Math.round(baseDamage * (p.statuses?.attackBuff ? 1 + (Number(p.statuses.attackBuff.value) || 0) : 1) * (target.statuses?.armorBreak ? 1.25 : 1) * (target.statuses?.hpDown ? 1 + (Number(target.statuses.hpDown.value) || 0) : 1));
      const dealt = Math.round(damage * (1 - (target.statuses?.resist?.value || 0)));
      p.lastAttack = now;
      target.hp = Math.max(0, target.hp - dealt);
      broadcast({ type: "combat-hit", attackerId: p.id, targetId: target.id, damage: dealt, hp: target.hp, kind: "auto" });
      broadcast({ type: "player", player: { id: target.id, name: target.name, x: target.x, y: 0, z: target.z, rotation: target.rotation, hp: target.hp } });
      if (target.hp === 0) scheduleRespawn(target);
      return;
    }
    if (msg.type === "ability-hit") {
      const now=Date.now();
      if(p.hp<=0)return;
      if(p.statuses?.silence||p.statuses?.stun||p.statuses?.air){send(ws,{type:"combat",result:"disabled",energy:p.energy});return;}
      if(now-p.lastAbility<250)return;
      const target=players.get(String(msg.targetId||"")),slot=String(msg.slot||""),weapon=p.weapon||"broadsword";
      const abilityId=String(msg.abilityId||(slot==="e"?WEAPON_E[weapon]:"")),ability=ABILITIES[abilityId];
      if(!target||target.id===p.id||target.hp<=0||!ability||!ABILITY_IDS.has(abilityId))return;
      if(!["q","w","e"].includes(slot))return;
      if(slot==="e"&&WEAPON_E[weapon]!==abilityId)return;
      if(slot==="q"&&p.loadout.q!==abilityId)return;
      if(slot==="w"&&p.loadout.w!==abilityId)return;
      if((p.abilityCooldowns[abilityId]||0)>now){send(ws,{type:"combat",result:"cooldown",abilityId,until:p.abilityCooldowns[abilityId],energy:p.energy});return;}
      if(p.energy < ability.cost){send(ws,{type:"combat",result:"energy",abilityId,energy:p.energy});return;}
      let dx=target.x-p.x,dz=target.z-p.z,distance=Math.hypot(dx,dz);
      const aimX=Number(msg.aimX),aimZ=Number(msg.aimZ);
      const castOriginX=p.x,castOriginZ=p.z;
      const isArea=Number.isFinite(aimX)&&Number.isFinite(aimZ)&&["cleave","cyclone","splitting","parry","spinning","bloodthirsty","carvingDash","soulless","majestic","infinity"].includes(abilityId);
      const selfCentered = ["cleave","parry","bloodthirsty","majestic","infinity"].includes(abilityId);
      if(abilityId==="ironwill"){p.energy-=ability.cost;p.abilityCooldowns[abilityId]=now+ability.cooldown*1000;applyEffects(p,ability.selfEffects||[],p.id);broadcast({type:"combat-effect",attackerId:p.id,abilityId,targetIds:[p.id],x:p.x,z:p.z});p.lastAbility=now;send(ws,{type:"combat-resource",energy:p.energy,abilityId,cooldownUntil:p.abilityCooldowns[abilityId]});return;}
      if(ability.dash&&distance<=ability.range&&distance>1.35){
        const travel=Math.min(distance-1.05,abilityId==="charge"?12:Math.max(2.7,distance-1.7));
        p.rotation=Math.atan2(dx,dz);
        p.x=Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,p.x+dx/distance*travel));
        p.z=Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,p.z+dz/distance*travel));
        distance=Math.hypot(target.x-p.x,target.z-p.z);
      }
      if((abilityId==="spinning"||abilityId==="carvingDash"||abilityId==="cyclone")&&Number.isFinite(aimX)&&Number.isFinite(aimZ)){
        const maxTravel=abilityId==="spinning"?12:abilityId==="carvingDash"?6:7,ax=aimX-p.x,az=aimZ-p.z,len=Math.hypot(ax,az);
        if(len>maxTravel+1)return;
        const travel=Math.min(maxTravel,len);
        if(len>.01){p.x=Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,p.x+ax/len*travel));p.z=Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,p.z+az/len*travel));p.rotation=Math.atan2(ax,az);}
      }
      let victims=[];
      if(ability.path&&isArea){
        const vx=p.x-castOriginX,vz=p.z-castOriginZ,l=Math.hypot(vx,vz)||1,ux=vx/l,uz=vz/l;
        victims=[...players.values()].filter(t=>t.hp>0&&t.id!==p.id&&(()=>{const rx=t.x-castOriginX,rz=t.z-castOriginZ,along=rx*ux+rz*uz,side=Math.abs(rx*uz-rz*ux);return along>=0&&along<=l&&side<=ability.radius;})());
      } else if(ability.radius&&isArea){
        const ax=selfCentered?p.x:Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,aimX)),az=selfCentered?p.z:Math.max(-WORLD_BOUND,Math.min(WORLD_BOUND,aimZ));
        if(!selfCentered&&Math.hypot(ax-castOriginX,az-castOriginZ)>(ability.range||7)+1)return;
        if(["bloodthirsty","infinity"].includes(abilityId)){
          const dx=aimX-castOriginX,dz=aimZ-castOriginZ,len=Math.hypot(dx,dz),ux=len>.3?dx/len:Math.sin(p.rotation),uz=len>.3?dz/len:Math.cos(p.rotation);
          victims=[...players.values()].filter(t=>{if(t.hp<=0||t.id===p.id)return false;const rx=t.x-castOriginX,rz=t.z-castOriginZ,d=Math.hypot(rx,rz);return d<=ability.radius&&(d<.3||(rx/d)*ux+(rz/d)*uz>=Math.cos(.8));});
        } else victims=[...players.values()].filter(t=>t.hp>0&&t.id!==p.id&&Math.hypot(t.x-ax,t.z-az)<=ability.radius);
      }
      else if(ability.line){
        const ox=castOriginX,oz=castOriginZ,tx=(abilityId==="splitting"&&Number.isFinite(aimX))?aimX:target.x,tz=(abilityId==="splitting"&&Number.isFinite(aimZ))?aimZ:target.z;
        const vx=tx-ox,vz=tz-oz,l=Math.hypot(vx,vz)||1,ux=vx/l,uz=vz/l,len=ability.line;
        victims=[...players.values()].filter(t=>t.hp>0&&t.id!==p.id&&(()=>{const rx=t.x-ox,rz=t.z-oz,a=rx*ux+rz*uz,side=Math.abs(rx*uz-rz*ux);return a>=0&&a<=len&&side<=1.5;})());
      }
      else {if(distance>(ability.range||4)){send(ws,{type:"combat",result:"out-of-range",targetId:target.id,abilityId,energy:p.energy});return;}victims=[target];}
      if(!victims.length){send(ws,{type:"combat",result:"no-target",targetId:target.id,abilityId,energy:p.energy});return;}
      p.lastAbility=now;p.energy-=ability.cost;p.abilityCooldowns[abilityId]=now+ability.cooldown*1000;
      send(ws,{type:"combat-resource",energy:p.energy,abilityId,cooldownUntil:p.abilityCooldowns[abilityId]});
      let castDamage=ability.damage;
      if(abilityId==="mightyBlow")castDamage=[269,432,649,918][Math.min(3,p.charges||0)];
      if(abilityId==="charge")castDamage=[390,560,780,1030][Math.min(3,p.charges||0)];
      if(abilityId==="carvingDash")castDamage=[260,340,430,540][Math.min(3,p.charges||0)];
      if(abilityId==="cyclone"&&(p.charges||0)>0){castDamage=162;p.charges--;}
      if(["mightyBlow","charge","carvingDash"].includes(abilityId))p.charges=0;
      for(const victim of victims){
        for(let hit=0;hit<(ability.hits||1);hit++){const amount=hit===(ability.hits||1)-1&&ability.secondDamage?ability.secondDamage:castDamage;const reduction=victim.statuses?.resist?.value||0;const vulnerability=(victim.statuses?.armorBreak?1.25:1)*(victim.statuses?.hpDown?1+(Number(victim.statuses.hpDown.value)||0):1);const dealt=Math.round(amount*(1-reduction)*vulnerability);victim.hp=Math.max(0,victim.hp-dealt);broadcast({type:"combat-hit",attackerId:p.id,targetId:victim.id,damage:dealt,hp:victim.hp,kind:"ability",slot,abilityId,hitIndex:hit});if(victim.hp<=0)break;}
        applyEffects(victim,ability.effects||[],p.id);
        if(victim.hp===0&&!victim.respawnTimer)scheduleRespawn(victim);
      }
      if(victims.length && ability.selfEffects){
        const selfEffects=abilityId==="cleave"?ability.selfEffects.map(e=>e.type==="charge"?{...e,amount:victims.length>=3?2:1}:e):ability.selfEffects;
        applyEffects(p,selfEffects,p.id);
      }
      broadcast({type:"combat-effect",attackerId:p.id,abilityId,targetIds:victims.map(v=>v.id),x:p.x,z:p.z,originX:castOriginX,originZ:castOriginZ,aimX:selfCentered?p.x:(Number.isFinite(aimX)?aimX:p.x),aimZ:selfCentered?p.z:(Number.isFinite(aimZ)?aimZ:p.z)});
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
  const dt = TICK_MS / 1000;
  for (const p of players.values()) {
    p.energy = Math.min(100, (p.energy ?? 100) + 4 * dt);
    p.lastDotTick = p.lastDotTick || Date.now();
    if (Date.now() - p.lastDotTick >= 500) {
      const now = Date.now();
      let statusExpired = false;
      for (const [key, st] of Object.entries(p.statuses || {})) {
        if (!st || st.until <= now) { delete p.statuses[key]; statusExpired = true; continue; }
        if (key === "bleed" && p.hp > 0) {
          const damage = Math.max(1, Math.round(Number(st.value || 60) * .5));
          p.hp = Math.max(0, p.hp - damage);
          broadcast({type:"combat-hit",attackerId:st.sourceId,targetId:p.id,damage,hp:p.hp,kind:"dot",abilityId:"bloodthirsty"});
          if (p.hp===0) scheduleRespawn(p);
        }
      }
      if (statusExpired) broadcast({type:"combat-status",targetId:p.id,statuses:p.statuses});
      p.lastDotTick = now;
    }
    if (p.hp <= 0) continue;
    const now = Date.now();
    if (!p.statuses) p.statuses = {};
    for (const [key, status] of Object.entries(p.statuses)) if (!status || status.until <= now) delete p.statuses[key];
    const rooted = ["root","stun","air"].some(key => p.statuses[key]);
    let dx = rooted ? 0 : p.input.x, dz = rooted ? 0 : p.input.z;
    if (p.moveTarget && !rooted) {
      dx = p.moveTarget.x - p.x;
      dz = p.moveTarget.z - p.z;
      const d = Math.hypot(dx,dz);
      if (d < .18) { p.x = p.moveTarget.x; p.z = p.moveTarget.z; p.moveTarget = null; dx = dz = 0; }
      else { dx /= d; dz /= d; }
    }
    const len = Math.hypot(dx,dz);
    if (len > 1) { dx /= len; dz /= len; }
    if (len > 0) {
      const slow = p.statuses.slow ? Math.max(0.2, 1 - Number(p.statuses.slow.value || 0)) : 1;
      const haste = p.statuses.haste ? 1 + Number(p.statuses.haste.value || 0) : 1;
      const speed = (p.moveTarget ? MOVE_SPEED : (p.input.running ? RUN_SPEED : MOVE_SPEED)) * slow * haste;
      p.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, p.x + dx * speed * dt));
      p.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, p.z + dz * speed * dt));
      p.rotation = Math.atan2(dx, dz);
    }
  }
  broadcast({type:"world-state", players:snapshot()});
}, TICK_MS);
server.on("close", () => { clearInterval(heartbeat); clearInterval(gameTick); });
server.listen(PORT, HOST, () => console.log(`Game server listening on ${HOST}:${PORT}`));
