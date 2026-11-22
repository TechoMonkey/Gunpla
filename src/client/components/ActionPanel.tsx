import { useState } from 'react';
import { describeSteps } from '../../engine/builder';
import type { Seat } from '../../engine/types';
import { otherSeat } from '../../engine/types';
import { HIDDEN_ORDER } from '../../engine/views';
import { send } from '../net';
import { bandLabel, sideName, useMatchCtx } from '../lib';
import { PromptPanel } from './PromptPanel';
import { heatClass } from './SuitCard';

/** "What do I do now?" for a seated player. */
export function ActionPanel({ seat }: { seat: Seat }) {
  const { update, view } = useMatchCtx();
  const opp = otherSeat(seat);
  const myPrompts = view.prompts.filter((p) => p.seat === seat && p.answer === undefined);
  const theirPrompts = view.prompts.filter((p) => p.seat === opp && p.answer === undefined);

  if (view.status === 'finished') return <ResultPanel seat={seat} />;

  if (myPrompts.length) {
    return (
      <div className="panel action">
        {myPrompts.map((p, i) => (
          <PromptPanel key={p.id} prompt={p} keyboard={i === 0} />
        ))}
      </div>
    );
  }

  const waitingOn = theirPrompts.length ? (
    <div className="waiting">
      <div className="spinner" />
      Waiting for {sideName(update, opp)}: <em>{theirPrompts[0].title}</em>
    </div>
  ) : null;

  if (view.status === 'deployment') {
    return <div className="panel action">{waitingOn ?? <div className="waiting">Setting up deployment…</div>}</div>;
  }

  const t = view.turn;
  if (view.status !== 'playing' || !t) return <div className="panel action">{waitingOn}</div>;
  const st = view.stage.kind;

  if (st === 'select') {
    if (view.nextSelector === seat) return <SelectPanel seat={seat} />;
    return (
      <div className="panel action">
        <div className="waiting">
          <div className="spinner" />
          {view.tokenHolder === opp ? `${sideName(update, opp)} holds the First Selection token and selects first…` : `Waiting for ${sideName(update, opp)} to select…`}
        </div>
        <SelectionSummary />
      </div>
    );
  }

  if (st === 'orders') {
    const sel = t.selections[seat];
    if (sel?.kind === 'suit') return <OrderPicker seat={seat} suitId={sel.suitId} />;
    return (
      <div className="panel action">
        <div className="waiting">
          <div className="spinner" />
          {sel?.kind === 'pass' ? 'You passed this turn.' : 'You have no activations left this round.'} Waiting for {sideName(update, opp)} to lock in an order…
        </div>
      </div>
    );
  }

  return (
    <div className="panel action">
      {waitingOn ?? (
        <div className="waiting">
          <div className="spinner" />
          Resolving…
        </div>
      )}
      <TurnQueue />
    </div>
  );
}

function SelectionSummary() {
  const { update, view } = useMatchCtx();
  const t = view.turn;
  if (!t) return null;
  const lines = (['p1', 'p2'] as Seat[])
    .map((seat) => {
      const sel = t.selections[seat];
      if (!sel) return null;
      if (sel.kind === 'pass') return `${sideName(update, seat)} passes.`;
      if (sel.kind === 'none') return `${sideName(update, seat)} has no activations left.`;
      const suit = view.suits.find((x) => x.id === sel.suitId)!;
      return `${sideName(update, seat)} selected ${suit.label}.`;
    })
    .filter(Boolean);
  if (!lines.length) return null;
  return (
    <div className="selection-summary">
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

function SelectPanel({ seat }: { seat: Seat }) {
  const { update, view, catalog } = useMatchCtx();
  const [busy, setBusy] = useState(false);
  const mine = view.suits.filter((x) => x.seat === seat && x.status === 'operational');
  const pass = view.canPass[seat];
  const first = view.turn?.firstSeat === seat;
  const act = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  return (
    <div className="panel action">
      <h3>{first ? 'You hold the First Selection token — select a Gunpla' : 'Select a Gunpla in response'}</h3>
      <SelectionSummary />
      <div className="select-grid">
        {mine.map((s) => (
          <button key={s.id} className="btn select-btn" disabled={busy} onClick={() => act(() => send({ type: 'select', suitId: s.id }))}>
            <strong>{s.label}</strong>
            <span className="small">
              Hull {s.hull}/{s.build.stats.hull} · <span className={heatClass(s.heat)}>Heat {s.heat}</span> · Acts {s.activations}
              {s.band !== 'grounded' ? ` · ${bandLabel(catalog, s.band)}` : ''}
            </span>
          </button>
        ))}
      </div>
      <button
        className="btn"
        disabled={busy || !pass.ok}
        title={pass.reason}
        onClick={() => {
          if (confirm('Pass this turn? You forfeit one remaining activation.')) void act(() => send({ type: 'pass' }));
        }}
      >
        Pass (forfeit 1 activation)
      </button>
      {!pass.ok && <div className="muted small">{pass.reason}</div>}
      <div className="muted small">
        Activations left this round: {view.teams[seat].activationsRemaining} of {view.teams[seat].allowance} · {sideName(update, otherSeat(seat))}:{' '}
        {view.teams[otherSeat(seat)].activationsRemaining}
      </div>
    </div>
  );
}

function OrderPicker({ seat, suitId }: { seat: Seat; suitId: string }) {
  const { update, view } = useMatchCtx();
  const suit = view.suits.find((x) => x.id === suitId)!;
  const t = view.turn!;
  const lockedKey = t.locked[seat];
  const [choice, setChoice] = useState<string | null>(lockedKey ?? null);
  const [busy, setBusy] = useState(false);
  const avail = view.availability[suitId];
  const opp = otherSeat(seat);
  const oppSel = t.selections[opp];
  const oppLocked = !!t.locked[opp];
  const oppSuit = oppSel?.kind === 'suit' ? view.suits.find((x) => x.id === oppSel.suitId) : undefined;

  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const status = (
    <div className="muted small">
      {oppSel?.kind === 'suit'
        ? `${sideName(update, opp)} selected ${oppSuit?.label} — ${oppLocked ? 'order locked ✓' : 'choosing an order…'}`
        : oppSel?.kind === 'pass'
          ? `${sideName(update, opp)} passed this turn.`
          : `${sideName(update, opp)} has no activations left.`}
    </div>
  );

  if (lockedKey) {
    const order = suit.build.orders.find((o) => o.key === lockedKey);
    return (
      <div className="panel action">
        <h3>Order locked in</h3>
        <div className="locked-order">
          🔒 {suit.label}: <strong>{order?.name}</strong> (phase {order?.phase}, weight {order?.weight})
        </div>
        {status}
        <div className="waiting">
          <div className="spinner" />
          Orders are revealed together once both players lock in.
        </div>
        <button className="btn" disabled={busy} onClick={() => run(() => send({ type: 'unlockOrder' }))}>
          Unlock to change
        </button>
      </div>
    );
  }

  return (
    <div className="panel action">
      <h3>Choose an order for {suit.label} (secret)</h3>
      {status}
      <div className="order-list">
        {suit.build.orders.map((o) => {
          const a = avail[o.key];
          return (
            <button
              key={o.key}
              className={`order-option ${choice === o.key ? 'chosen' : ''}`}
              disabled={!a?.ok || busy}
              onClick={() => setChoice(o.key)}
            >
              <div className="order-top">
                <strong>{o.name}</strong>
                <span className="order-meta">
                  <span>Phase {o.phase}</span>
                  <span>Wt {o.weight}</span>
                </span>
              </div>
              <div className="small muted">
                {o.source} · {describeSteps(o.steps)}
                {o.usesPerRound ? ` · ${o.usesPerRound}/round` : ''}
              </div>
              {!a?.ok && <div className="warn small">{a?.reason}</div>}
            </button>
          );
        })}
      </div>
      <button className="btn primary wide" disabled={!choice || busy} onClick={() => choice && run(() => send({ type: 'lockOrder', orderKey: choice }))}>
        🔒 Lock in order
      </button>
    </div>
  );
}

export function TurnQueue() {
  const { update, view } = useMatchCtx();
  const t = view.turn;
  if (!t || !t.queue.length) return null;
  return (
    <div className="turn-queue">
      <div className="muted small">This turn's orders, in resolution order:</div>
      {t.queue.map((q, i) => {
        const suit = view.suits.find((x) => x.id === q.suitId);
        const current = view.stage.kind === 'resolve' && view.stage.item === i;
        return (
          <div key={i} className={`queue-item side-${q.seat} ${q.status} ${current ? 'current' : ''}`}>
            <span>
              {i + 1}. {sideName(update, q.seat)} — {suit?.label}: <strong>{q.orderKey === HIDDEN_ORDER ? '???' : q.orderName}</strong>
            </span>
            <span className="small muted">
              P{q.phase} W{q.weight} {q.status === 'canceled' ? '✖ canceled' : q.status === 'done' ? '✓' : current ? '▶' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ResultPanel({ seat }: { seat: Seat }) {
  const { update, view } = useMatchCtx();
  const r = view.result;
  const won = r?.winner === seat;
  return (
    <div className={`panel action result ${r?.winner ? (won ? 'won' : 'lost') : 'draw'}`}>
      <h2>{r?.winner ? (won ? 'Victory!' : 'Defeat') : 'Draw'}</h2>
      <p>
        {r?.winner ? `${sideName(update, r.winner)} wins` : 'The match is drawn'} — {r?.reason}.
      </p>
      <p className="muted">
        Final victory points: {sideName(update, 'p1')} {view.teams.p1.vp} · {sideName(update, 'p2')} {view.teams.p2.vp}
      </p>
    </div>
  );
}
