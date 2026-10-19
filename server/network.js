'use strict';
/*
 * Game server network: several game and Minecraft servers as one group – started in order (backends first, then the proxy),
 * stopped in reverse order (proxy first, so nobody lands on a server that is going down), with one status line for all of
 * them. A Minecraft network with a Velocity proxy (Hostwerk's Minecraft → Network) is detected and can be taken over as a
 * group with one click; the proxy then always starts last and stops first.
 *
 * Data: settings.gameNetwork.groups = [{ id, name, members: [{ kind: 'game' | 'mc', id }], delay }]
 */
const crypto = require('crypto');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class GameNetwork {
  constructor(host) {
    this.host = host;
    this.ctx = host.ctx;
    this.T = (s, v) => host.t(s, v);
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
    return { name, members, delay };
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
    return { ...g, members, running, total: members.length, players: members.reduce((n, m) => n + (m.players || 0), 0), state: running === 0 ? 'stopped' : running === members.length ? 'running' : 'partial' };
  }

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
  run(id, action) {
    if (!['start', 'stop', 'restart'].includes(action)) throw Object.assign(new Error(this.T('Unknown action')), { status: 400 });
    const g = this.get(id);
    const T = this.T;
    const title = { start: T('Start network “{name}”', { name: g.name }), stop: T('Stop network “{name}”', { name: g.name }), restart: T('Restart network “{name}”', { name: g.name }) }[action];
    return this.host.core('jobs').runJob(title, async (job) => {
      const steps = action === 'restart' ? [['stop', this.order(g, 'stop')], ['start', this.order(g, 'start')]] : [[action, this.order(g, action)]];
      const total = steps.reduce((n, [, l]) => n + l.length, 0) || 1;
      let done = 0;
      const failed = [];
      for (const [act, list] of steps) {
        for (const m of list) {
          job.progress(Math.round((done / total) * 100), `${act === 'stop' ? T('Stopping') : T('Starting')}: ${m.name}`);
          try { await this.one(m, act); job.log(`✓ ${m.name}`); } catch (e) { failed.push(m.name); job.log(`✗ ${m.name}: ${e.message}`); }
          done++;
          if (act === 'start' && g.delay && done < total) await sleep(g.delay * 1000);
        }
      }
      this.host.broadcast({ type: 'game-network' });
      if (failed.length) throw new Error(T('Not everything worked: {list}', { list: failed.join(', ') }));
      return { ok: true, text: T('{n} servers done', { n: done }) };
    }, { key: `game-network-${id}-${action}` });
  }

  routes(r) {
    r.get('/game-network', (req, res) => res.json({ groups: this.list().map((g) => this.view(g)), candidates: this.candidates(), proxies: this.proxies() }));
    r.post('/game-network', (req, res) => res.json(this.create(req.body || {})));
    r.post('/game-network/from-proxy/:proxy', (req, res) => res.json(this.fromProxy(req.params.proxy)));
    r.put('/game-network/:id', (req, res) => res.json(this.update(req.params.id, req.body || {})));
    r.delete('/game-network/:id', (req, res) => { this.remove(req.params.id); res.json({ ok: true }); });
    r.post('/game-network/:id/:action', (req, res) => res.json({ job: this.run(req.params.id, req.params.action).id }));
  }
}

module.exports = { GameNetwork };
