import { useEffect, useState } from 'react';
import type { Seat } from '../../engine/types';
import type { MatchSummary } from '../../shared/protocol';
import { call, getName, getSeat, navigate, setName, setSeat, socket, toast, useConnected } from '../net';

interface Options {
  battlefields: Record<string, { label: string }>;
  rounds: number;
  error?: string;
}

export function Lobby() {
  const connected = useConnected();
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [name, setNameText] = useState(getName());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const load = () =>
      void call<{ matches: MatchSummary[]; isHost: boolean; warnings: string[] }>('lobby:list').then((r) => {
        if (!r.ok) return;
        setMatches(r.matches);
        setIsHost(r.isHost);
        setWarnings(r.warnings);
      });
    load();
    socket.on('connect', load);
    socket.on('lobby:changed', load);
    fetch('/api/whoami')
      .then((r) => r.json())
      .then((j: { urls?: string[] }) => setUrls(j.urls ?? []))
      .catch(() => undefined);
    return () => {
      socket.off('connect', load);
      socket.off('lobby:changed', load);
    };
  }, []);

  const join = (m: MatchSummary, seat: Seat) => {
    const trimmed = name.trim();
    const mine = getSeat(m.id);
    if (mine?.seat === seat) return navigate(`/m/${m.id}`);
    if (!trimmed) return toast('Enter your name first');
    setName(trimmed);
    setSeat(m.id, { seat, name: trimmed });
    navigate(`/m/${m.id}`);
  };

  const del = async (m: MatchSummary) => {
    if (!confirm(`Delete "${m.name}" permanently? Its saved data on the host will be removed.`)) return;
    const r = await call('host:delete', { matchId: m.id });
    if (!r.ok) toast(r.error);
  };

  return (
    <main className="page lobby">
      <header className="lobby-header">
        <div className="logo">◆</div>
        <div>
          <h1>Gunpla Wars</h1>
          <div className="muted">Tabletop battle host · foundation rules v0.1</div>
        </div>
        <span className={`conn ${connected ? 'on' : 'off'}`}>{connected ? 'Connected to host' : 'Connecting…'}</span>
      </header>

      {isHost && (
        <div className="panel host-banner">
          <strong>This is the host computer.</strong> Players on the same Wi-Fi join at{' '}
          {urls.length ? urls.map((u) => <code key={u}>{u}</code>) : <code>http://&lt;this computer's IP&gt;:3000</code>}. Open a match's <em>table view</em> here for host controls (undo, adjust stats, exports).
        </div>
      )}
      {warnings.map((w) => (
        <div key={w} className="panel warn">
          ⚠ {w}
        </div>
      ))}

      <div className="panel">
        <label className="field">
          <span>Your name</span>
          <input
            className="input"
            value={name}
            maxLength={30}
            placeholder="e.g. Amuro"
            onChange={(e) => {
              setNameText(e.target.value);
              setName(e.target.value.trim());
            }}
          />
        </label>
      </div>

      <div className="row space">
        <h2>Matches</h2>
        <button className="btn primary" onClick={() => setCreating(!creating)}>
          {creating ? 'Cancel' : '+ New match'}
        </button>
      </div>
      {creating && <CreateMatch onCreated={() => setCreating(false)} />}

      {matches === null ? (
        <div className="muted">Loading…</div>
      ) : matches.length === 0 ? (
        <div className="panel muted">No matches yet. Create one to get started.</div>
      ) : (
        <div className="match-list">
          {matches.map((m) => {
            const mine = getSeat(m.id);
            return (
              <div key={m.id} className="panel match-item">
                <div className="match-info">
                  <div className="match-title">{m.name}</div>
                  <div className="muted small">
                    {statusLabel(m)} · {m.pointsBudget} pts · {m.diceMode} dice · created {new Date(m.createdAt).toLocaleString()}
                  </div>
                  <div className="small">
                    {(['p1', 'p2'] as Seat[]).map((s) => (
                      <span key={s} className="seat-tag">
                        <span className={`dot ${m.seats[s]?.connected ? 'on' : 'off'}`} />
                        {s === 'p1' ? 'P1' : 'P2'}: {m.seats[s]?.name ?? 'open'}
                        {m.teamNames[s] ? ` (${m.teamNames[s]})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="match-actions">
                  {(['p1', 'p2'] as Seat[]).map((s) => {
                    const isMine = mine?.seat === s;
                    const taken = !!m.seats[s] && !isMine;
                    return (
                      <button key={s} className={`btn ${isMine ? 'primary' : ''}`} disabled={taken} onClick={() => join(m, s)}>
                        {isMine ? `Rejoin as ${s === 'p1' ? 'P1' : 'P2'}` : taken ? `${s === 'p1' ? 'P1' : 'P2'} taken` : `Join as ${s === 'p1' ? 'Player 1' : 'Player 2'}`}
                      </button>
                    );
                  })}
                  <button className="btn" onClick={() => navigate(`/m/${m.id}/table`)}>
                    {isHost ? 'Table view + host controls' : 'Watch'}
                  </button>
                  {isHost && (
                    <button className="btn danger small" onClick={() => del(m)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function statusLabel(m: MatchSummary): string {
  switch (m.status) {
    case 'building':
      return 'Building teams';
    case 'deployment':
      return 'Deployment';
    case 'playing':
      return `Round ${m.round}`;
    case 'finished':
      return m.result?.winner ? `Finished — ${m.teamNames[m.result.winner] || m.result.winner} won` : 'Finished — draw';
  }
}

function CreateMatch({ onCreated }: { onCreated: () => void }) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [form, setForm] = useState({ name: '', pointsBudget: '200', diceMode: 'software', battlefield: 'standard', rounds: '5', scaleNote: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void call<Options>('lobby:options').then((r) => {
      if (!r.ok) return;
      setOpts(r);
      setForm((f) => ({ ...f, rounds: String(r.rounds), battlefield: Object.keys(r.battlefields)[0] ?? 'standard' }));
    });
  }, []);

  const create = async () => {
    setBusy(true);
    const r = await call<{ matchId: string }>('lobby:create', { ...form, pointsBudget: Number(form.pointsBudget), rounds: Number(form.rounds) });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast('Match created — pick a seat to join it', 'info');
    onCreated();
  };

  return (
    <div className="panel create">
      {opts?.error && <div className="warn">The game data has problems, so new matches can't be created yet:<pre>{opts.error}</pre></div>}
      <div className="form-grid">
        <label className="field">
          <span>Match name</span>
          <input className="input" value={form.name} maxLength={60} placeholder="Friday night skirmish" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Points budget per player</span>
          <input className="input" type="number" min={1} value={form.pointsBudget} onChange={(e) => setForm({ ...form, pointsBudget: e.target.value })} />
        </label>
        <label className="field">
          <span>Rounds</span>
          <input className="input" type="number" min={1} max={50} value={form.rounds} onChange={(e) => setForm({ ...form, rounds: e.target.value })} />
        </label>
        <label className="field">
          <span>Battlefield</span>
          <select className="input" value={form.battlefield} onChange={(e) => setForm({ ...form, battlefield: e.target.value })}>
            {Object.entries(opts?.battlefields ?? { standard: { label: 'Standard' } }).map(([k, b]) => (
              <option key={k} value={k}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <span>Dice</span>
        <div className="segmented">
          <button className={`seg ${form.diceMode === 'software' ? 'on' : ''}`} onClick={() => setForm({ ...form, diceMode: 'software' })}>
            🎲 Software rolls
          </button>
          <button className={`seg ${form.diceMode === 'physical' ? 'on' : ''}`} onClick={() => setForm({ ...form, diceMode: 'physical' })}>
            ✋ Physical dice (players type results)
          </button>
        </div>
      </div>
      <label className="field">
        <span>Representation scale agreement (optional)</span>
        <input className="input" value={form.scaleNote} placeholder="e.g. Both teams use 1/144 HG kits for PG profiles" onChange={(e) => setForm({ ...form, scaleNote: e.target.value })} />
      </label>
      <button className="btn primary" disabled={busy || !form.name.trim()} onClick={create}>
        Create match
      </button>
    </div>
  );
}
