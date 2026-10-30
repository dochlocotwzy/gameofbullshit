/* Экран подключения и комната лобби. API: Lobby.mount(options), Lobby.handle(message). */
(() => {
  const css = `
#lb{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:radial-gradient(#1b2a22,#0b100d);color:#f3efe3;font:14px system-ui,sans-serif}
#lb.hidden{display:none}#lb .card{width:min(720px,94vw);max-height:90vh;overflow:auto;background:#14201be8;border:1px solid #ffffff30;border-radius:12px;padding:22px;box-shadow:0 8px 40px #000a}
#lb h1{margin:0 0 14px;font-size:22px}#lb label{display:block;margin:10px 0 4px;opacity:.8}
#lb input{width:100%;box-sizing:border-box;padding:9px;border-radius:8px;border:1px solid #ffffff40;background:#0b100d;color:inherit}
#lb button{padding:9px 16px;border-radius:8px;border:1px solid #ffffff40;background:#2b4a3a;color:inherit;cursor:pointer;font-weight:600}
#lb button:hover:not(:disabled){background:#3a6350}#lb button:disabled{opacity:.4;cursor:default}
#lb .row{display:flex;gap:10px;margin-top:16px;align-items:center;flex-wrap:wrap}#lb .teams{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#lb .team{border-radius:10px;padding:10px;border:1px solid #ffffff30;min-height:150px}#lb .team.blue{background:#1c3a5e55}#lb .team.red{background:#5e1c1c55}
#lb .team h2{margin:0 0 8px;font-size:15px;display:flex;justify-content:space-between;align-items:center}
#lb .pl{padding:4px 6px;border-radius:6px;display:flex;justify-content:space-between}#lb .pl.me{background:#ffffff18}
#lb .ok{color:#72e6a6}#lb .no{opacity:.5}#lb .err{color:#ff8d8d;min-height:18px;margin-top:8px}
@media(max-width:560px){#lb .teams{grid-template-columns:1fr}#lb .card{padding:15px}}
`;
  const T = { blue: "Синие", red: "Красные" };
  let opts = {}, root, st = null, el = {};
  let retryTimer = null, retryAttempt = 0, connecting = false;
  const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); kids.flat().forEach(k => n.append(k)); return n; };
  function mount(o = {}) {
    opts = o;
    const style = h("style", { textContent: css });
    const defServer = o.defaultServer || (/^https?:$/.test(location.protocol) ? location.host : "localhost:10000");
    el.name = h("input", { maxLength: 18, value: localStorage.getItem("lb_name") || "Игрок-" + Math.floor(100 + Math.random() * 900) });
    el.server = h("input", { value: localStorage.getItem("lb_server") || defServer, placeholder: "host:port или wss://…" });
    el.connectBtn = h("button", { textContent: "Подключиться", onclick: () => connect(false) });
    el.err = h("div", { className: "err" });
    el.connectView = h("div", {}, h("h1", { textContent: "Game of Bullshit" }), h("label", { textContent: "Имя" }), el.name, h("label", { textContent: "Сервер" }), el.server, h("div", { className: "row" }, el.connectBtn), el.err);
    el.teams = h("div", { className: "teams" });
    el.ready = h("button", { textContent: "Готов", onclick: () => send({ type: "lobby-ready", ready: !me()?.ready }) });
    el.auto = h("button", { textContent: "Авто-команда", onclick: () => send({ type: "lobby-team", team: "auto" }) });
    el.start = h("button", { textContent: "Начать игру", onclick: () => send({ type: "lobby-start" }) });
    el.leave = h("button", { textContent: "Выйти", onclick: () => { opts.onLeave?.(); show("connect"); } });
    el.hint = h("span", { className: "no" }); el.roomErr = h("div", { className: "err" });
    el.roomView = h("div", { style: "display:none" }, h("h1", { textContent: "Лобби" }), el.teams, h("div", { className: "row" }, el.ready, el.auto, el.start, el.leave, el.hint), el.roomErr);
    root = h("div", { id: "lb" }, h("div", { className: "card" }, el.connectView, el.roomView));
    document.head.append(style); document.body.append(root);
    if (o.autoShow !== false) show("connect");
    if (o.autoConnect === true) startAutoConnect();
  }
  const send = m => opts.send ? opts.send(m) : null;
  const me = () => st?.players.find(p => p.id === st.you);
  function connect(isAutomatic = false) {
    if (connecting) return Promise.reject(new Error("Подключение уже выполняется"));
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    const name = el.name.value.trim() || "Игрок", server = el.server.value.trim();
    if (!server) { el.err.textContent = "Укажи адрес сервера"; return Promise.reject(new Error("Укажи адрес сервера")); }
    localStorage.setItem("lb_name", name); localStorage.setItem("lb_server", server);
    connecting = true;
    el.err.textContent = isAutomatic ? "Пробуждаем сервер и устанавливаем соединение…" : "";
    el.connectBtn.disabled = true; el.connectBtn.textContent = "Подключение…";
    return Promise.resolve(opts.onConnect?.(normalizeUrl(server), name)).then(
      () => {
        connecting = false; retryAttempt = 0;
        el.connectBtn.disabled = false; el.connectBtn.textContent = "Подключиться";
        el.err.textContent = ""; show("room"); send({ type: "lobby-get" });
      },
      e => {
        connecting = false;
        el.connectBtn.disabled = false; el.connectBtn.textContent = "Подключиться";
        el.err.textContent = String(e?.message || "Не удалось подключиться");
        throw e;
      });
  }
  function startAutoConnect() {
    if (connecting || st?.phase === "playing") return;
    retryAttempt++;
    connect(true).catch(() => {
      const delay = Math.min(15000, 1500 * (2 ** Math.min(retryAttempt - 1, 3)));
      el.err.textContent = "Сервер пока не отвечает. Повторяем подключение через " + Math.ceil(delay / 1000) + " с…";
      retryTimer = setTimeout(startAutoConnect, delay);
    });
  }
  function normalizeUrl(s) {
    if (/^wss?:\/\//.test(s)) return s.replace(/\/?$/, "").replace(/\/multiplayer$/, "") + "/multiplayer";
    if (/^https?:\/\//.test(s)) { const u = new URL(s); return (u.protocol === "https:" ? "wss:" : "ws:") + "//" + u.host + "/multiplayer"; }
    const secure = location.protocol === "https:" && !/^(localhost|127\.|192\.168\.)/.test(s);
    return (secure ? "wss://" : "ws://") + s.replace(/\/$/, "") + "/multiplayer";
  }
  function show(view) { root.classList.remove("hidden"); el.connectView.style.display = view === "connect" ? "" : "none"; el.roomView.style.display = view === "room" ? "" : "none"; }
  const hide = () => root.classList.add("hidden");
  function render() {
    if (!st) return;
    el.teams.replaceChildren(...["blue", "red"].map(t => {
      const members = st.players.filter(p => p.team === t);
      return h("div", { className: "team " + t }, h("h2", {}, h("span", { textContent: `${T[t]} (${members.length}/${st.maxPerTeam})` }), h("button", { textContent: "Перейти", disabled: me()?.team === t || st.phase !== "lobby", onclick: () => send({ type: "lobby-team", team: t }) })),
        members.map(p => h("div", { className: "pl" + (p.id === st.you ? " me" : "") }, h("span", { textContent: (p.host ? "👑 " : "") + p.name }), h("span", { className: p.ready || p.host ? "ok" : "no", textContent: p.ready || p.host ? "готов" : "ждёт" }))));
    }));
    const m = me(), isHost = m && m.id === st.hostId;
    el.ready.textContent = m?.ready ? "Не готов" : "Готов"; el.ready.style.display = isHost ? "none" : "";
    el.start.style.display = isHost ? "" : "none"; el.start.disabled = !st.canStart;
    el.hint.textContent = isHost ? (st.canStart ? "" : "Ждём готовности остальных") : "Ждём, пока хост начнёт игру";
  }
  function handle(msg) {
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("lobby-")) return false;
    if (msg.type === "lobby-state") { st = msg; render(); if (st.phase === "playing") { hide(); opts.onStart?.(st); } }
    else if (msg.type === "lobby-error") { el.roomErr.textContent = msg.message || ""; setTimeout(() => { el.roomErr.textContent = ""; }, 3000); }
    else if (msg.type === "lobby-started") { hide(); opts.onStart?.(st); }
    return true;
  }
  window.Lobby = { mount, handle, show, hide, get state() { return st; } };
})();