import { useState } from 'react';
import { Network, Play, Square, RotateCcw, Plus, Trash2, Pencil, Users, Gamepad2, Box, Waypoints, Info, CalendarClock, Smartphone, AlertTriangle } from 'lucide-react';
import { post, put, del, useApi, waitJob } from '@hostwerk/api';
import { Btn, Callout, Empty, Field, InfoTip, Loading, Modal, StatusPill, Switch, TileEmpty, toast, confirmDialog } from '@hostwerk/ui';
import { contextMenu } from '@hostwerk/kit';
import { t } from '@hostwerk/i18n';
import { AddonTabs } from './addons';
import './style.css';

/*
 * Game server network: groups of game and Minecraft servers. Start them together (backends first, the proxy last), stop
 * them together (proxy first) and see at a glance how many are running and how many people play.
 */
const STATE = { running: 'running', stopped: 'stopped', partial: 'starting' };
const hrefOf = (m) => (m.kind === 'mc' ? `#/mc/${m.id}` : `#/ext/game-servers/${m.id}`);

function Editor({ init, candidates, onClose, onSaved }) {
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const has = (c) => f.members.some((m) => m.kind === c.kind && m.id === c.id);
  const toggle = (c) => setF({ ...f, members: has(c) ? f.members.filter((m) => !(m.kind === c.kind && m.id === c.id)) : [...f.members, { kind: c.kind, id: c.id }] });
  const save = async () => {
    setBusy(true);
    try { if (f.id) await put(`/game-network/${f.id}`, f); else await post('/game-network', f); toast.success('Saved'); onSaved(); } catch (e) { toast.error(e.message); }
    setBusy(false);
  };
  return (
    <Modal title={f.id ? t('Edit network') : t('New network')} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn className="primary" busy={busy} disabled={!f.name.trim() || !f.members.length} onClick={save}>Save</Btn></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Name"><input className="input" value={f.name} placeholder={t('e.g. Weekend servers')} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Extra pause between starts (seconds)" hint="Hostwerk always waits until a server is ready (Minecraft: “Done”, game servers: answer to the server query). The pause comes on top."><input className="input" type="number" min={0} max={120} value={f.delay} onChange={(e) => setF({ ...f, delay: e.target.value })} /></Field>
        </div>
        <Field label="Scheduled restart" hint="Restarts the whole network every day at this time – in the right order. Players get a message in the chat beforehand.">
          <div className="row-tight gn-wrap">
            <label className="check"><Switch checked={!!f.restart.enabled} onChange={(v) => setF({ ...f, restart: { ...f.restart, enabled: v } })} /> Every day at</label>
            <input className="input gn-time" type="time" value={f.restart.at} disabled={!f.restart.enabled} aria-label={t('Time of the restart')} onChange={(e) => setF({ ...f, restart: { ...f.restart, at: e.target.value } })} />
            <span className="small muted">{t('announce')}</span>
            <input className="input gn-num" type="number" min={0} max={30} value={f.restart.warn} disabled={!f.restart.enabled} aria-label={t('Minutes before')} onChange={(e) => setF({ ...f, restart: { ...f.restart, warn: e.target.value } })} />
            <span className="small muted">{t('minutes before')}</span>
          </div>
        </Field>
        <div className="label">{t('Servers in this network')}</div>
        {candidates.length === 0 ? <div className="small muted">No servers yet – create a game or Minecraft server first.</div> : (
          <div className="gn-pick">
            {candidates.map((c) => (
              <label key={`${c.kind}:${c.id}`} className={`gn-pick-item ${has(c) ? 'on' : ''}`}>
                <input type="checkbox" checked={has(c)} onChange={() => toggle(c)} />
                {c.kind === 'mc' ? <Box size={15} aria-hidden="true" /> : <Gamepad2 size={15} aria-hidden="true" />}
                <span className="grow ellipsis"><b>{c.name}</b> <span className="tiny muted">{c.game}{c.proxy ? ` · ${t('proxy')}` : ''}</span></span>
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function GroupCard({ g, onEdit, reload }) {
  const [busy, setBusy] = useState(null);
  const act = async (action, force = false) => {
    setBusy(action);
    let again = false;
    try { const r = await post(`/game-network/${g.id}/${action}`, force ? { force: true } : undefined); const j = await waitJob(r.job); toast.success((j.result && j.result.text) || t('Done')); } catch (e) {
      // Proxy nicht gestartet, weil ein Server dahinter fehlte: nachfragen, ob er trotzdem starten soll
      if (!force && /proxy|Proxy/.test(e.message) && action !== 'stop') again = await confirmDialog({ title: t('Start the proxy anyway?'), text: e.message, confirm: t('Start anyway') });
      else toast.error(e.message);
    }
    setBusy(null); reload();
    if (again) act(action, true);
  };
  const remove = async () => { if (await confirmDialog({ title: t('Remove network “{name}”?', { name: g.name }), text: 'Only the group is removed – the servers stay as they are.', confirm: 'Remove', danger: true })) { await del(`/game-network/${g.id}`); reload(); } };
  const menu = (e) => contextMenu(e, [
    { label: t('Start all'), icon: Play, onClick: () => act('start') },
    { label: t('Stop all'), icon: Square, onClick: () => act('stop') },
    { label: t('Restart all'), icon: RotateCcw, onClick: () => act('restart') },
    { label: t('Edit'), icon: Pencil, onClick: onEdit },
    { label: t('Remove'), icon: Trash2, danger: true, onClick: remove },
  ]);
  return (
    <div className="card gn-card" onContextMenu={menu}>
      <div className="card-head"><Waypoints size={16} /><h3 className="ellipsis">{g.name}</h3>
        <StatusPill state={STATE[g.state]} label={g.state === 'partial' ? t('{n} of {total} running', { n: g.running, total: g.total }) : undefined} />
        <div className="right row-tight"><button className="btn ghost xs icon" title="Edit" aria-label={t('Edit')} onClick={onEdit}><Pencil /></button></div>
      </div>
      <div className="card-body stack gn-gap">
        <div className="gn-facts small muted"><span>{t('{n} servers', { n: g.total })}</span>{g.players > 0 && <span><Users size={12} /> {t('{n} players', { n: g.players })}</span>}{g.delay > 0 && <span>{t('{n} s pause', { n: g.delay })}</span>}{g.restart.enabled && <span><CalendarClock size={12} /> {t('restart daily at {time}', { time: g.restart.at })}</span>}</div>
        {g.geyser && <Callout kind="info" icon={Smartphone} title={t('Geyser on the proxy instead of every server')}>{t('{list} run Geyser themselves. On the proxy “{proxy}” it is enough once – Bedrock players then reach every server of the network.', { list: g.geyser.backends.join(', '), proxy: g.geyser.proxyName })} <a className="btn sm" href={`#/mc/${g.geyser.proxy}/market`}>Open the proxy’s plugins</a></Callout>}
        <ol className="gn-members">
          {g.members.map((m) => (
            <li key={`${m.kind}:${m.id}`} className={m.running ? 'on' : ''}>
              <span className="gn-dot" aria-hidden="true" />
              {m.missing ? <span className="muted">{t('{name} (removed)', { name: m.name })}</span> : <a href={hrefOf(m)}>{m.name}</a>}
              {m.proxy && <span className="badge">{t('proxy')}</span>}
              <span className="sr-only">{m.running ? t('running') : t('stopped')}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="card-body row-tight gn-actions">
        <Btn className="sm primary" icon={Play} busy={busy === 'start'} disabled={!!busy || g.state === 'running'} onClick={() => act('start')}>Start all</Btn>
        <Btn className="sm" icon={Square} busy={busy === 'stop'} disabled={!!busy || g.state === 'stopped'} onClick={() => act('stop')}>Stop all</Btn>
        <Btn className="sm ghost" icon={RotateCcw} busy={busy === 'restart'} disabled={!!busy} onClick={() => act('restart')}>Restart</Btn>
      </div>
    </div>
  );
}

const blank = () => ({ name: '', members: [], delay: 5, restart: { enabled: false, at: '05:00', warn: 5 } });

export function NetworkPage({ ext }) {
  const d = useApi('/game-network', [], { live: false, poll: true });
  const [edit, setEdit] = useState(null);
  if (!d.data) return <div className="page">{d.error ? <Empty icon={AlertTriangle} title="The networks could not be loaded" text={d.error} action={<Btn icon={RotateCcw} onClick={() => d.reload()}>Try again</Btn>} /> : <Loading />}</div>;
  const { groups, candidates, proxies } = d.data;
  const open = proxies.filter((p) => !p.taken);
  const takeOver = async (p) => { try { await post(`/game-network/from-proxy/${p.id}`); toast.success(t('“{name}” taken over as a network', { name: p.name })); d.reload(); } catch (e) { toast.error(e.message); } };
  return (
    <div className="page fade-in">
      <div className="page-head">
        <div><h1><Network size={22} /> Game server network</h1><p>Group game and Minecraft servers – start and stop them together, in the right order, and see who plays where.</p></div>
        <div className="actions"><Btn className="grad" icon={Plus} onClick={() => setEdit(blank())}>New network</Btn></div>
      </div>
      <AddonTabs ext={ext}>
      <InfoTip title="How the order works" icon={Info}>Starting brings up every backend first and the proxy (Velocity) last, with the pause you chose in between. Stopping goes the other way round: the proxy first, so nobody lands on a server that is going down.</InfoTip>
      {open.map((p) => (
        <Callout key={p.id} kind="info" icon={Waypoints} title={t('Velocity network “{name}” found', { name: p.name })}>
          {t('{n} servers are behind this proxy.', { n: p.members.length })} <Btn className="sm primary gn-ml" onClick={() => takeOver(p)}>Take over as network</Btn>
        </Callout>
      ))}
      {groups.length === 0 ? (
        <div className="card"><Empty icon={Waypoints} title="No network yet" text="Put servers that belong together into one network – e.g. lobby, survival and minigames behind a Velocity proxy, or all servers for game night."><Btn className="grad" icon={Plus} onClick={() => setEdit(blank())}>Create network</Btn></Empty></div>
      ) : (
        <div className="grid grid-auto">{groups.map((g) => <GroupCard key={g.id} g={g} reload={d.reload} onEdit={() => setEdit({ id: g.id, name: g.name, delay: g.delay, restart: { ...g.restart }, members: g.members.map((m) => ({ kind: m.kind, id: m.id })) })} />)}</div>
      )}
      <div className="small muted">{t('BungeeCord and Waterfall are not set up by Hostwerk itself – for a Minecraft network Hostwerk uses Velocity (Minecraft → server → Network).')}</div>
      </AddonTabs>
      {edit && <Editor init={edit} candidates={candidates} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); d.reload(); }} />}
    </div>
  );
}

/** Kachel für die Übersicht: alle Spieler in allen Verbünden. */
function PlayersTile() {
  const d = useApi('/game-network/totals', [], { live: false, poll: true });
  if (!d.data && d.error) return <TileEmpty icon={AlertTriangle} text={t('Could not load: {error}', { error: d.error })} action="Try again" onClick={() => d.reload()} />;
  if (!d.data) return <div className="card-body"><div className="hw-skeleton gn-skel" /></div>;
  const x = d.data;
  if (!x.networks) return <TileEmpty icon={Waypoints} text="No network yet" href="#/ext/game-network" />;
  return (
    <a className="card-body stack gn-tile" href="#/ext/game-network">
      <div className="row-tight"><Users size={16} aria-hidden="true" /><b className="gn-big">{x.players.toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'de-DE')}</b><span className="small muted">{t('players online')}</span></div>
      <div className="small muted">{t('{running} of {servers} servers running in {networks} networks', x)}</div>
    </a>
  );
}

/** Auf der Seite eines Minecraft-Servers (auch des Proxys): zu welchem Verbund er gehört – mit Start/Stopp für alle. */
function MemberCard({ s }) {
  const d = useApi(s ? `/game-network/member/mc/${encodeURIComponent(s.id)}` : null, [s && s.id], { live: false, poll: true });
  const groups = d.data || [];
  if (!groups.length) return null;
  return (
    <div className="stack gn-gap">
      {groups.map((g) => (
        <div key={g.id} className="row-tight gn-wrap">
          <Waypoints size={15} aria-hidden="true" /><span className="small">{t('Part of the network')} <a href="#/ext/game-network"><b>{g.name}</b></a></span>
          <StatusPill state={STATE[g.state]} label={g.state === 'partial' ? t('{n} of {total} running', { n: g.running, total: g.total }) : undefined} />
          {g.players > 0 && <span className="tiny muted">{t('{n} players', { n: g.players })}</span>}
        </div>
      ))}
    </div>
  );
}

export default {
  pages: { main: NetworkPage },
  slots: {
    'dashboard.tiles': [{ id: 'players', title: 'Network players', icon: Users, size: 'third', Component: PlayersTile }],
    'mc.connect': [{ id: 'network', title: 'Network', Component: MemberCard, order: 70 }],
  },
};
