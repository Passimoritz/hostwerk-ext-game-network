'use strict';
/*
 * Game server network: several game and Minecraft servers as one group – started in order (backends first, then the proxy),
 * stopped in reverse order (proxy first, so nobody lands on a server that is going down), with one status line for all of
 * them. A Minecraft network with a Velocity proxy (Hostwerk's Minecraft → Network) is detected and can be taken over as a
 * group with one click; the proxy then always starts last and stops first.
 *
 * Starting waits until each server is really ready (Minecraft: "Done", game servers: answer to the Steam query) before
 * the next one starts; the pause comes on top. If a backend fails, the proxy is not started (unless asked to anyway).
 * A scheduled restart announces itself in the chat beforehand.
 *
 * Data: settings.gameNetwork.groups = [{ id, name, members: [{ kind: 'game' | 'mc', id }], delay, restart: { enabled, at, warn } }]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Geplanter Neustart: was ist jetzt fällig? 'warn' = Ansage (warn Minuten vorher), 'restart' = Neustart, sonst null.
 * Jede Phase höchstens einmal am Tag (fired merkt sich „<gruppe>:<tag>:<phase>“). Ein verpasster Zeitpunkt (Hostwerk
 * lief nicht) wird nur innerhalb von 5 Minuten nachgeholt – kein Neustart mitten am Tag.
 */
function due(g, now, fired) {
  const r = g.restart;
  if (!r || !r.enabled || !/^\d{2}:\d{2}$/.test(r.at || '')) return null;
  const d = new Date(now);
  const [h, m] = r.at.split(':').map(Number);
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
  const key = `${g.id}:${dayKey(d)}`;
  if (now >= at && now - at < 5 * 60000 && !fired.has(`${key}:restart`)) return 'restart';
  const warnAt = at - (r.warn || 0) * 60000;
  if (r.warn > 0 && now >= warnAt && now < at && !fired.has(`${key}:warn`)) return 'warn';
  return null;
}

class GameNetwork {
  constructor(host) {
    this.host = host;
    this.ctx = host.ctx;
    this.T = (s, v) => host.t(s, v);
    this.pollMs = 2000; // wie oft „bereit?“ gefragt wird
    this.readyMs = 180000; // höchstens so lange auf einen Server warten
    this.fired = new Set();
  }
  /** Zeitplan prüfen (alle 30 Sekunden) – geplante Neustarts mit Ansage im Chat. */
  startTimer() {
    this.timer = setInterval(() => this.tick().catch(() => {}), 30000);
    if (this.timer.unref) this.timer.unref();
  }
  stopTimer() { clearInterval(this.timer); }
  async tick(now = Date.now()) {
    for (const g of this.list()) {
      const what = due(g, now, this.fired);
      if (!what) continue;
      this.fired.add(`${g.id}:${dayKey(new Date(now))}:${what}`);
      if (what === 'warn') await this.announce(g, this.T('Scheduled restart of the network in {n} minutes.', { n: g.restart.warn }));
      else if (this.view(g).running > 0) { await this.announce(g, this.T('The network restarts now – back in a moment.')); this.run(g.id, 'restart').promise.catch(() => {}); }
    }
  }
  /** Nachricht in den Chat aller laufenden Server des Verbunds (Minecraft: say auf den Backends, Spiele-Server: say per Konsole). */
  async announce(g, text) {
    const msg = String(text).replace(/[\r\n]+/g, ' ').slice(0, 200);
    for (const m of g.members.map((x) => this.member(x)).filter((x) => x.running && !x.missing && !x.proxy)) {
      try {
        if (m.kind === 'mc') await this.ctx.minecraft.command(m.id, `say ${msg}`);
        else if (this.ctx.games && typeof this.ctx.games.send === 'function') await this.ctx.games.send(this.ctx.games.get(m.id), `say ${msg}`);
      } catch { /* ein Server ohne Konsole hält die anderen nicht auf */ }
    }
  }
  get cfg() { const s = this.ctx.settings.get(); if (!s.gameNetwork) s.gameNetwork = { groups: [] }; return s.gameNetwork; }
  list() { return this.cfg.groups; }
  get(id) { const g = this.list().find((x) => x.id === id); if (!g) throw Object.assign(new Error(this.T('Network not found')), { status: 404 }); return g; }

  /* ---------- members ---------- */
  /** Everything that can be part of a network: game servers (extension) and Minecraft servers (Hostwerk). */
  candidates() {
    const out = [];
    for (const s of (this.ctx.games ? this.ctx.games.list() : [])) out.push({ kind: 'game', id: s.id, name: s.name, game: s.gameName || s.game, running: !!s.running, proxy: false });
    const mc = this.ctx.minecraft;
    if (mc) for (const s of mc.list()) out.push({ kind: 'mc', id: s.id, name: s.name, game: 'Minecraft', type: s.type, running: this.mcRunning(s.id), proxy: mc.isProxy(s), players: this.mcPlayers(s.id) });
    return out;
  }
  mcRunning(id) { try { return this.ctx.minecraft.proc(id).isRunning(); } catch { return false; } }
  /** Minecraft ist bereit, wenn der Server „Done“ gemeldet hat (ohne diese Angabe: sobald er läuft). */
  mcReady(id) { try { const p = this.ctx.minecraft.proc(id); if (!p.isRunning()) return false; return !p.extra || p.extra.ready === undefined ? true : !!p.extra.ready; } catch { return false; } }
  /** Bereit? Minecraft: „Done“; Spiele-Server: läuft und antwortet auf die Steam-Abfrage (A2S). */
  async ready(m) {
    if (m.kind === 'mc') return this.mcReady(m.id);
    const games = this.ctx.games; if (!games) return false;
    let s; try { s = games.get ? games.get(m.id) : games.list().find((x) => x.id === m.id); } catch { return false; }
    if (!s || !s.running) return false;
    if (typeof games.live !== 'function') return true;
    try { return !!(await games.live(s)); } catch { return false; }
  }
  /** Warten, bis ein Server bereit ist. Spiele-Server ohne Antwort auf die Abfrage: nach der Wartezeit trotzdem weiter. */
  async waitReady(m, job) {
    const until = Date.now() + this.readyMs;
    while (Date.now() < until) {
      if (await this.ready(m)) return true;
      await sleep(this.pollMs);
    }
    if (m.kind === 'game') { if (job) job.log(`… ${this.T('{name} does not answer the server query – carrying on', { name: m.name })}`); return true; }
    throw new Error(this.T('{name} did not get ready in time', { name: m.name }));
  }
  mcPlayers(id) { try { const p = this.ctx.minecraft.proc(id); return (p.extra && p.extra.playerCount) || 0; } catch { return 0; } }
  member(m) {
    const c = this.candidates().find((x) => x.kind === m.kind && x.id === m.id);
    return c || { ...m, name: m.id, missing: true, running: false };
  }

  /** Velocity proxies with their backends (from Hostwerk's Minecraft network) – ready to take over as a group. */
  proxies() {
    const mc = this.ctx.minecraft;
    if (!mc) return [];
    return mc.list().filter((s) => mc.isProxy(s)).map((p) => ({
      id: p.id, name: p.name,
      members: mc.list().filter((s) => s.network && s.network.proxy === p.id).map((s) => ({ kind: 'mc', id: s.id, name: s.name })),
      taken: this.list().some((g) => g.members.some((m) => m.kind === 'mc' && m.id === p.id)),
    }));
  }

  /* ---------- groups ---------- */
  clean(b) {
    const name = String(b.name || '').trim().slice(0, 60);
    if (!name) throw Object.assign(new Error(this.T('Please give the network a name.')), { status: 400 });
    const members = [];
    for (const m of Array.isArray(b.members) ? b.members : []) {
      if (!m || !['game', 'mc'].includes(m.kind) || typeof m.id !== 'string') continue;
      if (!members.some((x) => x.kind === m.kind && x.id === m.id)) members.push({ kind: m.kind, id: m.id });
    }
    const delay = Math.max(0, Math.min(120, Number(b.delay) || 0));
    const r = b.restart && typeof b.restart === 'object' ? b.restart : {};
    const restart = { enabled: !!r.enabled, at: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.at || '')) ? r.at : '05:00', warn: Math.max(0, Math.min(30, Math.round(Number(r.warn ?? 5)) || 0)) };
    return { name, members, delay, restart };
  }
  create(b) {
    const g = { id: crypto.randomBytes(4).toString('hex'), ...this.clean(b || {}), createdAt: Date.now() };
    this.list().push(g); this.ctx.settings.save();
    return this.view(g);
  }
  update(id, b) { const g = this.get(id); Object.assign(g, this.clean({ ...g, ...(b || {}) })); this.ctx.settings.save(); return this.view(g); }
  remove(id) { this.get(id); this.cfg.groups = this.list().filter((x) => x.id !== id); this.ctx.settings.save(); }
  fromProxy(proxyId) {
    const p = this.proxies().find((x) => x.id === proxyId);
    if (!p) throw Object.assign(new Error(this.T('This is not a Velocity proxy.')), { status: 400 });
    return this.create({ name: p.name, members: [...p.members, { kind: 'mc', id: p.id }], delay: 5 });
  }

  /** Start order: every backend first, proxies last. Stop order: the reverse. */
  order(g, dir = 'start') {
    const all = g.members.map((m) => this.member(m));
    const sorted = [...all.filter((m) => !m.proxy), ...all.filter((m) => m.proxy)];
    return dir === 'start' ? sorted : sorted.reverse();
  }
  view(g) {
    const members = g.members.map((m) => this.member(m));
    const running = members.filter((m) => m.running).length;
    return { ...g, restart: g.restart || { enabled: false, at: '05:00', warn: 5 }, members, running, total: members.length, players: members.reduce((n, m) => n + (m.players || 0), 0), state: running === 0 ? 'stopped' : running === members.length ? 'running' : 'partial', geyser: this.geyser(g) };
  }
  /** Geyser liegt auf Backends, aber nicht am Proxy? Dann besser einmal am Proxy statt auf jedem Server (Bedrock-Spieler kommen über den Proxy). */
  geyser(g) {
    const mc = this.ctx.minecraft; if (!mc || typeof mc.dir !== 'function') return null;
    const has = (id) => { try { return fs.readdirSync(path.join(mc.dir(id), 'plugins')).some((f) => /^geyser.*\.jar$/i.test(f)); } catch { return false; } };
    const members = g.members.map((m) => this.member(m)).filter((m) => m.kind === 'mc' && !m.missing);
    const proxy = members.find((m) => m.proxy);
    if (!proxy) return null;
    const backends = members.filter((m) => !m.proxy && has(m.id)).map((m) => m.name);
    return backends.length && !has(proxy.id) ? { proxy: proxy.id, proxyName: proxy.name, backends } : null;
  }
  /** Summen über alle Verbünde (Kachel der Übersicht). */
  totals() {
    const v = this.list().map((g) => this.view(g));
    return { networks: v.length, servers: v.reduce((n, g) => n + g.total, 0), running: v.reduce((n, g) => n + g.running, 0), players: v.reduce((n, g) => n + g.players, 0) };
  }
  /** Verbünde, zu denen ein Server gehört (für seine Seite). */
  forMember(kind, id) { return this.list().filter((g) => g.members.some((m) => m.kind === kind && m.id === id)).map((g) => this.view(g)); }

  async one(m, action) {
    if (m.missing) throw new Error(this.T('“{name}” no longer exists', { name: m.name }));
    if (m.kind === 'mc') {
      const mc = this.ctx.minecraft;
      if (action === 'start') { if (!this.mcRunning(m.id)) await mc.start(m.id); return; }
      if (action === 'stop') { if (this.mcRunning(m.id)) await mc.stop(m.id); return; }
      return mc.restart(m.id);
    }
    if (!this.ctx.games) throw new Error(this.T('The game servers extension is missing.'));
    if (action === 'start' && m.running) return;
    if (action === 'stop' && !m.running) return;
    await this.ctx.games.run(m.id, action).promise;
  }

  /** Start/stop/restart all members of a network as one job, in order and with the chosen pause. */
  run(id, action, { force = false } = {}) {
    if (!['start', 'stop', 'restart'].includes(action)) throw Object.assign(new Error(this.T('Unknown action')), { status: 400 });
    const g = this.get(id);
    const T = this.T;
    const title = { start: T('Start network “{name}”', { name: g.name }), stop: T('Stop network “{name}”', { name: g.name }), restart: T('Restart network “{name}”', { name: g.name }) }[action];
    return this.host.core('jobs').runJob(title, async (job) => {
      const steps = action === 'restart' ? [['stop', this.order(g, 'stop')], ['start', this.order(g, 'start')]] : [[action, this.order(g, action)]];
      const total = steps.reduce((n, [, l]) => n + l.length, 0) || 1;
      let done = 0;
      const failed = [];
      const skipped = [];
      for (const [act, list] of steps) {
        for (const m of list) {
          // Proxy erst, wenn alle Server dahinter laufen – sonst landen Spieler im Leeren (außer ausdrücklich gewünscht)
          if (act === 'start' && m.proxy && failed.length && !force) { skipped.push(m.name); job.log(`– ${m.name}: ${T('not started, because a server behind it failed')}`); done++; continue; }
          job.progress(Math.round((done / total) * 100), `${act === 'stop' ? T('Stopping') : T('Starting')}: ${m.name}`);
          try {
            const was = act === 'start' ? await this.ready(m) : false;
            await this.one(m, act);
            if (act === 'start' && !was) { job.progress(Math.round((done / total) * 100), T('Waiting until {name} is ready', { name: m.name })); await this.waitReady(m, job); }
            job.log(`✓ ${m.name}`);
          } catch (e) { failed.push(m.name); job.log(`✗ ${m.name}: ${e.message}`); }
          done++;
          if (act === 'start' && g.delay && done < total) await sleep(g.delay * 1000);
        }
      }
      this.host.broadcast({ type: 'game-network' });
      if (skipped.length) throw Object.assign(new Error(T('{list} failed – the proxy was not started.', { list: failed.join(', ') })), { code: 'PROXY_SKIPPED' });
      if (failed.length) throw new Error(T('Not everything worked: {list}', { list: failed.join(', ') }));
      return { ok: true, text: T('{n} servers done', { n: done }) };
    }, { key: `game-network-${id}-${action}` });
  }

  routes(r) {
    r.get('/game-network', (req, res) => res.json({ groups: this.list().map((g) => this.view(g)), candidates: this.candidates(), proxies: this.proxies(), totals: this.totals() }));
    r.get('/game-network/totals', (req, res) => res.json(this.totals()));
    r.get('/game-network/member/:kind/:id', (req, res) => res.json(this.forMember(req.params.kind, req.params.id)));
    r.post('/game-network', (req, res) => res.json(this.create(req.body || {})));
    r.post('/game-network/from-proxy/:proxy', (req, res) => res.json(this.fromProxy(req.params.proxy)));
    r.put('/game-network/:id', (req, res) => res.json(this.update(req.params.id, req.body || {})));
    r.delete('/game-network/:id', (req, res) => { this.remove(req.params.id); res.json({ ok: true }); });
    r.post('/game-network/:id/:action', (req, res) => res.json({ job: this.run(req.params.id, req.params.action, { force: !!(req.body || {}).force }).id }));
  }
}

module.exports = { GameNetwork, due };
