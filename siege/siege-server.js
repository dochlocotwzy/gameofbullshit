"use strict";
// Осада: две базы, стены, ворота (10 000 HP), ратуши. Всё считает сервер.
// Не зависит от остального server.js: нужное приходит через createSiege({...}).
const CFG = {
  gateHp: 10000, hallHp: 8000,
  baseCenterX: 71.3, baseCenterZ: -16.1,   // синие слева (x<0), красные справа (x>0)
  halfX: 30, halfZ: 26, wall: 2,           // стены вокруг базы
  gateHalf: 4,                             // полуширина проёма ворот (по z)
  hallOffset: 23, hallR: 4.2,              // ратуша у задней стены
  interactRange: 8,                        // дистанция открытия ворот
  playerR: 0.5,
};

function createSiege({ players, send, broadcast, now = () => Date.now(), attackRange = 3.8, cooldownMs = 850, damageFor = () => 40, cfg = {} }) {
  const C = { ...CFG, ...cfg };
  const walls = [];       // непроходимые прямоугольники {x0,x1,z0,z1}
  const structures = [];  // ратуши и ворота
  let over = null;

  for (const team of ["blue", "red"]) {
    const s = team === "blue" ? -1 : 1;           // сторона карты
    const cx = s * C.baseCenterX, cz = C.baseCenterZ, t = C.wall / 2;
    const frontX = cx - s * C.halfX, backX = cx + s * C.halfX; // front смотрит на реку/врага
    const rect = (x0, x1, z0, z1) => walls.push({ team, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0, z1 });
    rect(cx - C.halfX - t, cx + C.halfX + t, cz - C.halfZ - t, cz - C.halfZ + t); // север
    rect(cx - C.halfX - t, cx + C.halfX + t, cz + C.halfZ - t, cz + C.halfZ + t); // юг
    rect(backX - t, backX + t, cz - C.halfZ, cz + C.halfZ);                       // тыл
    rect(frontX - t, frontX + t, cz - C.halfZ, cz - C.gateHalf);                  // фронт, северная часть
    rect(frontX - t, frontX + t, cz + C.gateHalf, cz + C.halfZ);                  // фронт, южная часть
    structures.push({ id: "gate-" + team, kind: "gate", team, x: frontX, z: cz, x0: frontX - t, x1: frontX + t, z0: cz - C.gateHalf, z1: cz + C.gateHalf, hp: C.gateHp, maxHp: C.gateHp, open: false });
    structures.push({ id: "hall-" + team, kind: "hall", team, x: cx + s * C.hallOffset, z: cz, r: C.hallR, hp: C.hallHp, maxHp: C.hallHp });
  }
  const byId = id => structures.find(s => s.id === id);
  const gateOf = team => byId("gate-" + team);
  const gateClosed = g => !g.open && g.hp > 0;

  // Столкновение для движения (используется сервером вместо isRiverBlocked).
  function isSolid(x, z, r = C.playerR) {
    for (const w of walls) if (x > w.x0 - r && x < w.x1 + r && z > w.z0 - r && z < w.z1 + r) return true;
    for (const s of structures) {
      if (s.kind === "gate" && gateClosed(s) && x > s.x0 - r && x < s.x1 + r && z > s.z0 - r && z < s.z1 + r) return true;
      if (s.kind === "hall" && s.hp > 0 && Math.hypot(x - s.x, z - s.z) < s.r + r) return true;
    }
    return false;
  }
  function distanceTo(s, x, z) {
    if (s.kind === "hall") return Math.max(0, Math.hypot(x - s.x, z - s.z) - s.r);
    const cx = Math.max(s.x0, Math.min(s.x1, x)), cz = Math.max(s.z0, Math.min(s.z1, z));
    return Math.hypot(x - cx, z - cz);
  }

  const pubStruct = s => ({ id: s.id, kind: s.kind, team: s.team, x: s.x, z: s.z, r: s.r, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, hp: s.hp, maxHp: s.maxHp, open: !!s.open });
  const snapshot = () => ({ type: "siege-state", over, walls, structures: structures.map(pubStruct), spawn: { blueX: -C.baseCenterX, redX: C.baseCenterX, z: C.baseCenterZ } });
  const err = (p, message) => send(p.ws, { type: "siege-error", message });

  function finish(winner) {
    if (over) return;
    over = { winner, at: now() };
    broadcast({ type: "siege-over", winner, loser: winner === "blue" ? "red" : "blue" });
    broadcast(snapshot());
  }

  // Удар по ратуше/воротам. Возвращает true, если урон нанесён.
  function attack(p, id) {
    const s = byId(String(id));
    if (over) return err(p, "Матч уже завершён."), false;
    if (!s || s.hp <= 0 || !p || p.hp <= 0) return false;
    if (p.team === s.team) return err(p, "Это ваше строение."), false;
    if (now() - (p.lastSiegeAttack || 0) < cooldownMs * 0.9) return false;
    if (distanceTo(s, p.x, p.z) > attackRange + 0.6) return err(p, "Слишком далеко."), false;
    p.lastSiegeAttack = now();
    s.hp = Math.max(0, s.hp - Math.max(1, Math.floor(damageFor(p))));
    broadcast({ type: "siege-hit", id: s.id, hp: s.hp, by: p.id });
    if (s.hp <= 0) {
      if (s.kind === "gate") { s.open = true; broadcast({ type: "siege-destroyed", id: s.id, byTeam: p.team }); broadcast(snapshot()); }
      else finish(p.team);
    }
    return true;
  }

  // Открыть/закрыть свои ворота рядом с ними. Враг и мёртвые не могут.
  function setGate(p, id, open) {
    const g = byId(String(id));
    if (over || !g || g.kind !== "gate" || !p || p.hp <= 0) return false;
    if (p.team !== g.team) return err(p, "Чужие ворота можно только ломать."), false;
    if (g.hp <= 0) return err(p, "Ворота разрушены."), false;
    if (distanceTo(g, p.x, p.z) > C.interactRange) return err(p, "Подойдите к воротам."), false;
    if (now() - (p.lastGateToggle || 0) < 500) return false;
    open = open === true;
    if (g.open === open) return true;
    if (!open) { // нельзя закрыть, пока в проёме кто-то стоит
      const blocked = [...players.values()].some(q => q.hp > 0 && q.x > g.x0 - 1.4 && q.x < g.x1 + 1.4 && q.z > g.z0 - 1.4 && q.z < g.z1 + 1.4);
      if (blocked) return err(p, "В проходе кто-то стоит."), false;
    }
    p.lastGateToggle = now();
    g.open = open;
    broadcast({ type: "siege-gate", id: g.id, open, by: p.id });
    return true;
  }

  function reset() {
    over = null;
    for (const s of structures) { s.hp = s.maxHp; if (s.kind === "gate") s.open = false; }
    broadcast(snapshot());
  }

  // true — сообщение siege-* обработано.
  function handle(p, msg) {
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("siege-")) return false;
    if (msg.type === "siege-get") send(p.ws, snapshot());
    else if (msg.type === "siege-attack") attack(p, msg.id);
    else if (msg.type === "siege-gate") setGate(p, msg.id, msg.open);
    return true;
  }

  return { handle, attack, setGate, reset, isSolid, snapshot, structures, walls, config: C, get over() { return over; } };
}

module.exports = { createSiege, CFG };
