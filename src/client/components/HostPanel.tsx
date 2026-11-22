import { useEffect, useState } from 'react';
import { BANDS, type Band, type StatKey } from '../../engine/schema';
import type { AdjustChanges, Seat, SuitStatus } from '../../engine/types';
import { PromptPanel } from './PromptPanel';
import { call, send, toast } from '../net';
import { bandLabel, playerName, sideName, useMatchCtx } from '../lib';

/** Host-only tools: only rendered on the host computer. */
export function HostPanel() {
  const { update, view } = useMatchCtx();
  const pending = view.prompts.filter((p) => p.answer === undefined);

  const undo = async () => {
    const last = update.lastCommand;
    if (!last) return;
    if (!confirm(`Undo the last step (#${last.seq}: ${last.type} by ${last.actor})? Any dice it rolled are discarded.`)) return;
    const r = await call<{ undone?: string }>('host:undo');
    if (!r.ok) toast(r.error);
    else toast(`Undid ${r.undone}`, 'info');
  };

  const freeSeat = async (seat: Seat) => {
    if (!confirm(`Free ${playerName(update, seat)}'s seat? They (or someone else) can then join it again from any device.`)) return;
    const r = await call('host:freeSeat', { seat });
    if (!r.ok) toast(r.error);
  };

  return (
    <section className="host-panel">
      <h2>Host controls</h2>
      <p className="muted small">Only shown on the host computer. Every change is written to the battle log.</p>
      <div className="host-grid">
        <div className="panel">
          <h3>Match</h3>
          <div className="row wrap">
            <button className="btn" disabled={!update.commandCount} onClick={undo}>
              ↶ Undo last step
            </button>
            <a className="btn" href={`/api/matches/${view.id}/report.txt`}>
              ⬇ Playtest report
            </a>
            <a className="btn" href={`/api/matches/${view.id}/export.json`}>
              ⬇ Full JSON
            </a>
          </div>
          {update.lastCommand && (
            <div className="muted small">
              Last step #{update.lastCommand.seq}: {update.lastCommand.type} by {update.lastCommand.actor}
            </div>
          )}
          <h4>Seats</h4>
          {(['p1', 'p2'] as Seat[]).map((s) => (
            <div key={s} className="row">
              <span className={`dot ${update.seats[s]?.connected ? 'on' : 'off'}`} />
              <span className="grow">
                {s === 'p1' ? 'Player 1' : 'Player 2'}: {update.seats[s]?.name ?? 'empty'}
              </span>
              {update.seats[s] && (
                <button className="btn small" onClick={() => freeSeat(s)}>
                  Free seat
                </button>
              )}
            </div>
          ))}
          <div className="muted small">Spectators/table screens: {update.spectators}</div>
          {view.status !== 'finished' && view.status !== 'building' && <EndMatch />}
        </div>

        {pending.length > 0 && (
          <div className="panel">
            <h3>Answer for a player</h3>
            <p className="muted small">Use this if a player's device dropped out.</p>
            {pending.map((p) => (
              <PromptPanel key={p.id} prompt={p} onBehalf keyboard={false} />
            ))}
          </div>
        )}

        {view.suits.length > 0 && <AdjustSuit />}
        {view.status !== 'building' && <AdjustTeams />}
      </div>
    </section>
  );
}

function EndMatch() {
  const { update } = useMatchCtx();
  const [winner, setWinner] = useState<string>('none');
  const [reason, setReason] = useState('');
  return (
    <details>
      <summary>End the match early</summary>
      <div className="row wrap">
        <select className="input" value={winner} onChange={(e) => setWinner(e.target.value)}>
          <option value="none">Draw</option>
          <option value="p1">{sideName(update, 'p1')} wins</option>
          <option value="p2">{sideName(update, 'p2')} wins</option>
        </select>
        <input className="input grow" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button
          className="btn danger"
          onClick={() => {
            if (confirm('End the match now?')) void send({ type: 'endMatch', winner: winner === 'none' ? null : (winner as Seat), reason: reason || 'ended by the host' });
          }}
        >
          End match
        </button>
      </div>
    </details>
  );
}

function AdjustSuit() {
  const { view, catalog } = useMatchCtx();
  const [suitId, setSuitId] = useState(view.suits[0]?.id ?? '');
  const suit = view.suits.find((x) => x.id === suitId);
  const [form, setForm] = useState<{ hull: string; heat: string; band: Band; status: SuitStatus; wreckHull: string; activations: string; exempt: boolean; disabled: string[] }>();
  const [note, setNote] = useState('');
  const [eff, setEff] = useState<{ stat: StatKey; amount: string; until: 'turn' | 'round' | 'manual' }>({ stat: 'armor', amount: '1', until: 'round' });

  const reset = () => {
    if (!suit) return;
    setForm({
      hull: String(suit.hull),
      heat: String(suit.heat),
      band: suit.band,
      status: suit.status,
      wreckHull: String(suit.wreckHull),
      activations: String(suit.activations),
      exempt: suit.coolingExempt,
      disabled: [...suit.disabled],
    });
  };
  // Refresh the form whenever the selected suit or its state changes.
  const sig = suit ? JSON.stringify([suit.id, suit.hull, suit.heat, suit.band, suit.status, suit.wreckHull, suit.activations, suit.coolingExempt, suit.disabled]) : '';
  useEffect(reset, [sig]);

  if (!suit || !form) return null;
  const entries = [...suit.build.orders.map((o) => ({ key: o.key, name: `${o.name} (${o.source})`, prot: o.protected })), ...suit.build.counterattacks.map((c) => ({ key: c.key, name: `${c.name} (counter)`, prot: false }))];

  const apply = async () => {
    const c: AdjustChanges = {};
    const n = (s: string) => Number(s);
    if (n(form.hull) !== suit.hull) c.hull = n(form.hull);
    if (n(form.heat) !== suit.heat) c.heat = n(form.heat);
    if (form.band !== suit.band) c.band = form.band;
    if (form.status !== suit.status) c.status = form.status;
    if (n(form.wreckHull) !== suit.wreckHull) c.wreckHull = n(form.wreckHull);
    if (n(form.activations) !== suit.activations) c.activations = n(form.activations);
    if (form.exempt !== suit.coolingExempt) c.coolingExempt = form.exempt;
    if (JSON.stringify([...form.disabled].sort()) !== JSON.stringify([...suit.disabled].sort())) c.disabled = form.disabled;
    if (!Object.keys(c).length) return toast('Nothing changed', 'info');
    if (await send({ type: 'adjust', suitId: suit.id, changes: c, note: note || undefined })) setNote('');
  };

  const addEffect = () => {
    const amount = Number(eff.amount);
    if (!Number.isFinite(amount) || amount === 0) return toast('Enter a non-zero amount');
    void send({ type: 'adjust', suitId: suit.id, changes: { addEffect: { stat: eff.stat, amount, until: eff.until, note: note || undefined } }, note: note || undefined });
  };

  return (
    <div className="panel">
      <h3>Adjust a Gunpla</h3>
      <p className="muted small">For counterattacks, interception, crash impacts, terrain and corrections (automated in v2).</p>
      <select className="input" value={suitId} onChange={(e) => setSuitId(e.target.value)}>
        {view.suits.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label} ({s.seat === 'p1' ? 'P1' : 'P2'})
          </option>
        ))}
      </select>
      <div className="adjust-grid">
        <label className="field">
          <span>Hull (max {suit.build.stats.hull})</span>
          <input className="input" type="number" min={0} value={form.hull} onChange={(e) => setForm({ ...form, hull: e.target.value })} />
        </label>
        <label className="field">
          <span>Heat</span>
          <input className="input" type="number" min={0} value={form.heat} onChange={(e) => setForm({ ...form, heat: e.target.value })} />
        </label>
        <label className="field">
          <span>Flight band</span>
          <select className="input" value={form.band} onChange={(e) => setForm({ ...form, band: e.target.value as Band })}>
            {BANDS.map((b) => (
              <option key={b} value={b}>
                {bandLabel(catalog, b)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SuitStatus })}>
            <option value="operational">Operational</option>
            <option value="wreck">Wreck</option>
            <option value="removed">Removed</option>
          </select>
        </label>
        <label className="field">
          <span>Wreck Hull</span>
          <input className="input" type="number" min={0} value={form.wreckHull} onChange={(e) => setForm({ ...form, wreckHull: e.target.value })} />
        </label>
        <label className="field">
          <span>Activations this round</span>
          <input className="input" type="number" min={0} value={form.activations} onChange={(e) => setForm({ ...form, activations: e.target.value })} />
        </label>
        <label className="field check">
          <input type="checkbox" checked={form.exempt} onChange={(e) => setForm({ ...form, exempt: e.target.checked })} />
          <span>Cooling exemption</span>
        </label>
      </div>
      <details>
        <summary>Heat-disabled orders ({form.disabled.length})</summary>
        {entries.map((e) => (
          <label key={e.key} className="field check">
            <input
              type="checkbox"
              disabled={e.prot}
              checked={form.disabled.includes(e.key)}
              onChange={(ev) => setForm({ ...form, disabled: ev.target.checked ? [...form.disabled, e.key] : form.disabled.filter((k) => k !== e.key) })}
            />
            <span>
              {e.name}
              {e.prot ? ' (protected)' : ''}
            </span>
          </label>
        ))}
      </details>
      <label className="field">
        <span>Note for the log (optional)</span>
        <input className="input" value={note} placeholder="e.g. Heat Hawk Counter hit for 4" onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row">
        <button className="btn primary" onClick={apply}>
          Apply changes
        </button>
        <button className="btn" onClick={reset}>
          Reset
        </button>
      </div>

      <h4>Temporary modifiers</h4>
      {suit.effects.map((e) => (
        <div key={e.id} className="row">
          <span className="grow small">
            {e.amount >= 0 ? '+' : ''}
            {e.amount} {e.stat} · {e.source} · {e.expires.kind}
          </span>
          <button className="btn small" onClick={() => send({ type: 'adjust', suitId: suit.id, changes: { removeEffectId: e.id } })}>
            Remove
          </button>
        </div>
      ))}
      <div className="row wrap">
        <select className="input" value={eff.stat} onChange={(e) => setEff({ ...eff, stat: e.target.value as StatKey })}>
          <option value="armor">Armor</option>
          <option value="shieldingDice">Shielding dice</option>
          <option value="movement">Movement</option>
        </select>
        <input className="input narrow" type="number" value={eff.amount} onChange={(e) => setEff({ ...eff, amount: e.target.value })} />
        <select className="input" value={eff.until} onChange={(e) => setEff({ ...eff, until: e.target.value as typeof eff.until })}>
          <option value="turn">until end of turn</option>
          <option value="round">until end of round</option>
          <option value="manual">until removed</option>
        </select>
        <button className="btn" onClick={addEffect}>
          Add modifier
        </button>
      </div>
    </div>
  );
}

function AdjustTeams() {
  const { update, view } = useMatchCtx();
  return (
    <div className="panel">
      <h3>Adjust teams</h3>
      {(['p1', 'p2'] as Seat[]).map((s) => (
        <TeamRow key={`${s}-${view.teams[s].vp}-${view.teams[s].activationsRemaining}`} seat={s} name={sideName(update, s)} vp={view.teams[s].vp} acts={view.teams[s].activationsRemaining} />
      ))}
    </div>
  );
}

function TeamRow({ seat, name, vp, acts }: { seat: Seat; name: string; vp: number; acts: number }) {
  const [v, setV] = useState(String(vp));
  const [a, setA] = useState(String(acts));
  return (
    <div className="row wrap">
      <span className="grow">{name}</span>
      <label className="field inline">
        <span>VP</span>
        <input className="input narrow" type="number" min={0} value={v} onChange={(e) => setV(e.target.value)} />
      </label>
      <label className="field inline">
        <span>Activations left</span>
        <input className="input narrow" type="number" min={0} value={a} onChange={(e) => setA(e.target.value)} />
      </label>
      <button
        className="btn small"
        onClick={() =>
          send({
            type: 'adjustTeam',
            seat,
            vp: Number(v) !== vp ? Number(v) : undefined,
            activationsRemaining: Number(a) !== acts ? Number(a) : undefined,
          })
        }
      >
        Apply
      </button>
    </div>
  );
}
