'use strict';
/*
 * Game server network with fake game and Minecraft servers: groups are stored in settings.gameNetwork, members are checked,
 * the start order puts the proxy last and the stop order first, a Velocity network is taken over, a failing member is
 * reported without stopping the others, and every text has German.
 */
const test = require('node:test');
const assert = require('node:assert');
const { GameNetwork } = require('../server/network');
const ext = require('../server/index');
const de = require('../locales/de.json');

const fill = (s, v) => (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m)) : s);

function world(lang = 'en') {
  const S = { general: { language: lang } };
  const calls = [];
  const running = new Set(['lobby']);
  const mcList = [
    { id: 'proxy', name: 'Velocity', type: 'velocity' },
    { id: 'lobby', name: 'Lobby', type: 'paper', network: { proxy: 'proxy', key: 'lobby' } },
    { id: 'survival', name: 'Survival', type: 'paper', network: { proxy: 'proxy', key: 'survival' } },
  ];
  const minecraft = {
    list: () => mcList,
    isProxy: (s) => s.type === 'velocity',
    proc: (id) => ({ isRunning: () => running.has(id), extra: { playerCount: id === 'lobby' ? 3 : 0 } }),
    start: async (id) => { calls.push(`start mc:${id}`); running.add(id); },
    stop: async (id) => { calls.push(`stop mc:${id}`); running.delete(id); },
    restart: async (id) => { calls.push(`restart mc:${id}`); },
  };
  const games = {
    list: () => [{ id: 'vh-1', name: 'Valheim', gameName: 'Valheim', running: false }, { id: 'bad-1', name: 'Broken', running: false }],
    run: (id, action) => ({ promise: id === 'bad-1' ? Promise.reject(new Error('boom')) : Promise.resolve(calls.push(`${action} game:${id}`)) }),
  };
  const jobs = [];
  const host = {
    S, calls, jobs,
    ctx: { settings: { get: () => S, save: () => {} }, minecraft, games },
    t: (s, v) => fill(lang === 'de' && de[s] ? de[s] : s, v),
    broadcast: () => {},
    core: (n) => ({ jobs: { runJob: (title, fn) => { const job = { log: () => {}, progress: () => {} }; const promise = fn(job); jobs.push({ title, promise }); return { id: 'j', promise }; } } }[n]),
  };
  return host;
}

test('groups live in settings.gameNetwork; names and members are checked', () => {
  const h = world('de');
  const n = new GameNetwork(h);
  assert.throws(() => n.create({ name: ' ' }), /Bitte gib dem Verbund einen Namen/);
  const g = n.create({ name: 'Abend', members: [{ kind: 'game', id: 'vh-1' }, { kind: 'game', id: 'vh-1' }, { kind: 'evil', id: 'x' }], delay: 999 });
  assert.strictEqual(h.S.gameNetwork.groups.length, 1);
  assert.strictEqual(g.members.length, 1, 'duplicates and unknown kinds dropped');
  assert.strictEqual(g.delay, 120, 'pause capped');
  assert.strictEqual(n.update(g.id, { name: 'Spieleabend' }).name, 'Spieleabend');
  n.remove(g.id);
  assert.throws(() => n.get(g.id), /Verbund nicht gefunden/);
});

test('Velocity network is found and taken over; proxy starts last and stops first', () => {
  const n = new GameNetwork(world());
  const p = n.proxies();
  assert.strictEqual(p.length, 1);
  assert.deepStrictEqual(p[0].members.map((m) => m.id), ['lobby', 'survival']);
  const g = n.fromProxy('proxy');
  assert.ok(n.proxies()[0].taken);
  const gg = n.get(g.id);
  assert.deepStrictEqual(n.order(gg, 'start').map((m) => m.id), ['lobby', 'survival', 'proxy']);
  assert.deepStrictEqual(n.order(gg, 'stop').map((m) => m.id), ['proxy', 'survival', 'lobby']);
  const v = n.view(gg);
  assert.strictEqual(v.state, 'partial');
  assert.strictEqual(v.players, 3);
  assert.throws(() => n.fromProxy('lobby'), /not a Velocity proxy/);
});

test('start all: already running ones are skipped, the proxy comes last', async () => {
  const h = world();
  const n = new GameNetwork(h);
  const g = n.fromProxy('proxy');
  n.update(g.id, { delay: 0 });
  await n.run(g.id, 'start').promise;
  assert.deepStrictEqual(h.calls, ['start mc:survival', 'start mc:proxy']);
});

test('a failing member is reported, the others still run', async () => {
  const h = world('de');
  const n = new GameNetwork(h);
  const g = n.create({ name: 'Mix', members: [{ kind: 'game', id: 'bad-1' }, { kind: 'game', id: 'vh-1' }] });
  await assert.rejects(n.run(g.id, 'start').promise, /Nicht alles hat geklappt: Broken/);
  assert.deepStrictEqual(h.calls, ['start game:vh-1']);
  assert.throws(() => n.run(g.id, 'explode'), /Unbekannte Aktion/);
});

test('activate provides gameNetwork with routes', () => {
  const h = world();
  const routes = []; const provided = {};
  ext.activate({ ...h, router: new Proxy({}, { get: (_, m) => (p) => routes.push(`${m.toUpperCase()} ${p}`) }), provide: (k, v) => { provided[k] = v; return v; } });
  assert.ok(provided.gameNetwork instanceof GameNetwork);
  for (const r of ['GET /game-network', 'POST /game-network', 'POST /game-network/from-proxy/:proxy', 'POST /game-network/:id/:action']) assert.ok(routes.includes(r), r);
});

test('every German text has a value', () => {
  for (const [k, v] of Object.entries(de)) if (k !== '$patterns') assert.ok(typeof v === 'string' && v.trim(), k);
});
