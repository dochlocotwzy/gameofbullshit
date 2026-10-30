/* Клиент осады: модели стен/ворот/ратуш, HP-бары, столкновения, экран победы.
   Подключение: <script src="/siege/siege-client.js"></script>, затем Siege.init({...}). См. siege/INTEGRATION.md */
(() => {
  let o = {}, T, root, hud = {}, over = null, attackTimer = null;
  const S = { walls: [], structures: [], meshes: {}, flash: {} };
  const TEAM = { blue: 'Синие', red: 'Красные' }, COL = { blue: 0x3b6fd6, red: 0xc94040 };

  function init(opts) {
    o = opts; T = o.THREE;
    root = new T.Group(); o.scene.add(root);
    const css = document.createElement('style');
    css.textContent = `
#sg-hud{position:fixed;top:44px;left:50%;transform:translateX(-50%);z-index:30;display:flex;gap:10px;font:12px system-ui,sans-serif;color:#fff;pointer-events:none}
#sg-hud .b{min-width:170px;background:#0009;border-radius:8px;padding:5px 8px} #sg-hud .bar{height:7px;border-radius:4px;background:#0006;margin-top:3px;overflow:hidden} #sg-hud .bar i{display:block;height:100%}
#sg-prompt{position:fixed;bottom:120px;left:50%;transform:translateX(-50%);z-index:30;background:#000b;color:#fff;padding:7px 12px;border-radius:8px;font:13px system-ui,sans-serif;display:none;pointer-events:none;text-align:center}
#sg-over{position:fixed;inset:0;z-index:2147482000;display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:#000a;color:#fff;font:15px system-ui,sans-serif;text-align:center}
#sg-over h1{margin:0;font-size:38px} #sg-over button{padding:10px 20px;border-radius:8px;border:1px solid #fff5;background:#2b4a3a;color:#fff;font-size:15px;font-weight:600;cursor:pointer}`;
    document.head.append(css);
    hud.box = Object.assign(document.createElement('div'), { id: 'sg-hud' });
    hud.prompt = Object.assign(document.createElement('div'), { id: 'sg-prompt' });
    hud.over = Object.assign(document.createElement('div'), { id: 'sg-over' });
    document.body.append(hud.box, hud.prompt, hud.over);
    setInterval(updatePrompt, 150);
    addEventListener('keyup', e => { if (e.code === 'KeyG') stopAttack(); });
    addEventListener('blur', stopAttack);
  }

  const mat = (c, extra = {}) => new T.MeshStandardMaterial({ color: c, roughness: .9, ...extra });
  function build(msg) {
    S.walls = msg.walls; S.structures = msg.structures;
    root.clear(); S.meshes = {};
    const stone = mat(0x8a8577);
    for (const w of S.walls) {
      const m = new T.Mesh(new T.BoxGeometry(w.x1 - w.x0, 5, w.z1 - w.z0), stone);
      m.position.set((w.x0 + w.x1) / 2, 2.5, (w.z0 + w.z1) / 2); root.add(m);
    }
    for (const s of S.structures) {
      const g = new T.Group(); let body;
      if (s.kind === 'gate') {
        body = new T.Mesh(new T.BoxGeometry(s.x1 - s.x0, 4.6, s.z1 - s.z0), mat(0x5a3b1e));
        body.position.set((s.x0 + s.x1) / 2, 2.3, (s.z0 + s.z1) / 2); g.add(body);
        for (const dz of [-1, 1]) { // башенки по бокам ворот
          const tw = new T.Mesh(new T.BoxGeometry(3, 7, 3), stone); tw.position.set(s.x, 3.5, s.z + dz * (s.z1 - s.z0) / 2 + dz * 1.5); g.add(tw);
        }
      } else {
        body = new T.Mesh(new T.BoxGeometry(s.r * 1.8, 5, s.r * 1.8), mat(0xb9ad92)); body.position.set(s.x, 2.5, s.z); g.add(body);
        const roof = new T.Mesh(new T.ConeGeometry(s.r * 1.5, 3.6, 4), mat(COL[s.team])); roof.position.set(s.x, 6.8, s.z); roof.rotation.y = Math.PI / 4; g.add(roof);
        const flag = new T.Mesh(new T.BoxGeometry(.2, 2.4, .2), mat(0x333333)); flag.position.set(s.x, 9.6, s.z); g.add(flag);
      }
      root.add(g); S.meshes[s.id] = { g, body, s, y: 0 };
      applyState(s);
    }
    renderHud();
  }

  function applyState(s) {
    const m = S.meshes[s.id]; if (!m) return;
    if (s.kind === 'gate') m.targetY = s.open || s.hp <= 0 ? -4.4 : 0; // опущены в землю, когда открыты/разрушены
    else m.g.visible = s.hp > 0 || !!over; // ратуша остаётся видимой в финале
  }
  function renderHud() {
    hud.box.replaceChildren(...['blue', 'red'].map(t => {
      const h = S.structures.find(s => s.id === 'hall-' + t), g = S.structures.find(s => s.id === 'gate-' + t);
      const d = document.createElement('div'); d.className = 'b';
      if (!h) return d;
      d.innerHTML = `<b style="color:#${COL[t].toString(16)}">${TEAM[t]}</b> · ратуша ${Math.ceil(h.hp)}/${h.maxHp}<div class="bar"><i style="width:${h.hp / h.maxHp * 100}%;background:#${COL[t].toString(16)}"></i></div>`
        + `<div style="opacity:.8;margin-top:3px">ворота ${g.hp > 0 ? Math.ceil(g.hp) + '/' + g.maxHp + (g.open ? ' (открыты)' : '') : 'разрушены'}</div>`;
      return d;
    }));
  }

  function showOver(msg) {
    const mine = o.getTeam(), win = msg.winner === mine;
    const isHost = window.Lobby?.state && window.Lobby.state.hostId === window.Lobby.state.you;
    hud.over.innerHTML = `<h1 style="color:${win ? '#7be3a0' : '#ff8d8d'}">${win ? 'Победа!' : 'Поражение'}</h1><div>Ратуша ${TEAM[msg.loser]} разрушена. Победили ${TEAM[msg.winner].toLowerCase()}.</div>`;
    const b = document.createElement('div');
    if (isHost) { const btn = Object.assign(document.createElement('button'), { textContent: 'Новая партия', onclick: () => { o.send({ type: 'lobby-reset' }); } }); b.append(btn); }
    else b.textContent = 'Ждём, пока хост начнёт новую партию…';
    hud.over.append(b); hud.over.style.display = 'flex';
    stopAttack();
  }

  function handle(msg) {
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('siege-')) return false;
    if (msg.type === 'siege-state') {
      over = msg.over; build(msg);
      if (over) showOver({ winner: over.winner, loser: over.winner === 'blue' ? 'red' : 'blue' }); else hud.over.style.display = 'none';
    } else if (msg.type === 'siege-hit') {
      const s = S.structures.find(x => x.id === msg.id); if (!s) return true;
      s.hp = msg.hp; renderHud(); flash(msg.id);
    } else if (msg.type === 'siege-gate') {
      const s = S.structures.find(x => x.id === msg.id); if (s) { s.open = msg.open; applyState(s); renderHud(); o.toast?.(msg.open ? 'Ворота открыты' : 'Ворота закрыты'); }
    } else if (msg.type === 'siege-destroyed') {
      const s = S.structures.find(x => x.id === msg.id); if (s) { s.hp = 0; s.open = true; applyState(s); renderHud(); }
      o.toast?.('Ворота ' + TEAM[msg.byTeam === 'blue' ? 'red' : 'blue'].toLowerCase() + ' разрушены!');
    } else if (msg.type === 'siege-over') {
      over = { winner: msg.winner }; showOver(msg);
    } else if (msg.type === 'siege-error') o.toast?.(msg.message);
    return true;
  }
  function flash(id) {
    const m = S.meshes[id]; if (!m || !m.body.material.emissive) return;
    m.body.material.emissive.setHex(0xff3322); clearTimeout(S.flash[id]);
    S.flash[id] = setTimeout(() => m.body.material.emissive.setHex(0), 120);
  }
  // Плавное опускание/подъём ворот; вызывать каждый кадр.
  function tick() {
    for (const id in S.meshes) { const m = S.meshes[id]; if (m.targetY === undefined) continue; m.y += (m.targetY - m.y) * 0.12; m.g.position.y = m.y; }
  }

  // Столкновения (то же, что на сервере): стены, закрытые ворота, ратуши.
  function resolve(pos, pr) {
    const boxes = [...S.walls];
    for (const s of S.structures) if (s.kind === 'gate' && !s.open && s.hp > 0) boxes.push(s);
    for (const b of boxes) {
      const cx = Math.max(b.x0, Math.min(b.x1, pos.x)), cz = Math.max(b.z0, Math.min(b.z1, pos.z)), dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < pr * pr) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2); pos.x = cx + dx / d * pr; pos.z = cz + dz / d * pr; }
        else { const l = pos.x - b.x0, r = b.x1 - pos.x, t = pos.z - b.z0, bt = b.z1 - pos.z, m = Math.min(l, r, t, bt); if (m === l) pos.x = b.x0 - pr; else if (m === r) pos.x = b.x1 + pr; else if (m === t) pos.z = b.z0 - pr; else pos.z = b.z1 + pr; }
      }
    }
    for (const s of S.structures) if (s.kind === 'hall' && s.hp > 0) {
      const dx = pos.x - s.x, dz = pos.z - s.z, rs = s.r + pr, d2 = dx * dx + dz * dz;
      if (d2 < rs * rs) { const d = Math.sqrt(d2) || 1e-4; pos.x = s.x + dx / d * rs; pos.z = s.z + dz / d * rs; }
    }
  }

  const dist = (s, x, z) => {
    if (s.kind === 'hall') return Math.max(0, Math.hypot(x - s.x, z - s.z) - s.r);
    return Math.hypot(x - Math.max(s.x0, Math.min(s.x1, x)), z - Math.max(s.z0, Math.min(s.z1, z)));
  };
  const nearest = (enemy, range) => {
    const p = o.getPos(), team = o.getTeam(); let best = null, bd = range;
    for (const s of S.structures) {
      if (s.hp <= 0 || (enemy ? s.team === team : s.team !== team || s.kind !== 'gate')) continue;
      const d = dist(s, p.x, p.z); if (d <= bd) { bd = d; best = s; }
    }
    return best;
  };

  // F: открыть/закрыть свои ворота. true — действие выполнено (клавишу «съедаем»).
  function tryGate() {
    if (over) return false;
    const g = nearest(false, 8); if (!g) return false;
    o.send({ type: 'siege-gate', id: g.id, open: !g.open }); return true;
  }
  const canHit = () => !over && nearest(true, 5);
  function startAttack() {
    if (attackTimer || !canHit()) return false;
    const fire = () => { const s = nearest(true, 5); if (!s || over) return stopAttack(); o.send({ type: 'siege-attack', id: s.id }); };
    fire(); attackTimer = setInterval(fire, 450); return true;
  }
  function stopAttack() { clearInterval(attackTimer); attackTimer = null; }

  function updatePrompt() {
    if (!o.getPos || over || !S.structures.length) { hud.prompt.style.display = 'none'; return; }
    const g = nearest(false, 8), e = nearest(true, 5);
    const txt = e ? `Удерживайте G — бить ${e.kind === 'gate' ? 'ворота' : 'ратушу'} врага (${Math.ceil(e.hp)}/${e.maxHp})` : g ? `F — ${g.open ? 'закрыть' : 'открыть'} ворота` : '';
    hud.prompt.textContent = txt; hud.prompt.style.display = txt ? 'block' : 'none';
  }

  window.Siege = { init, handle, tick, resolve, tryGate, startAttack, stopAttack, canHit, get state() { return S; }, get over() { return over; } };
})();
