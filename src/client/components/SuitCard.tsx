import { useState } from 'react';
import { describeSteps } from '../../engine/builder';
import type { SuitState } from '../../engine/types';
import { currentArmor, currentMovement, currentShieldingDice, effectTotal } from '../../engine/util';
import { bandLabel, seatClass, useMatchCtx } from '../lib';

export function heatClass(heat: number): string {
  if (heat <= 0) return 'heat-0';
  if (heat <= 1) return 'heat-1';
  if (heat <= 3) return 'heat-2';
  if (heat <= 7) return 'heat-3';
  if (heat <= 15) return 'heat-4';
  return 'heat-5';
}

export function SuitCard({ suit, active, showOrders = true }: { suit: SuitState; active?: boolean; showOrders?: boolean }) {
  const { catalog, view } = useMatchCtx();
  const [open, setOpen] = useState(false);
  const b = suit.build;
  const avail = view.availability[suit.id] ?? {};
  const down = suit.status !== 'operational';
  const hullPct = Math.max(0, Math.min(100, (suit.hull / b.stats.hull) * 100));
  const armor = currentArmor(suit);
  const shield = currentShieldingDice(catalog, suit);
  const move = currentMovement(suit);
  const turnSel = view.turn?.selections[suit.seat];
  const inTurn = ['select', 'orders', 'resolve'].includes(view.stage.kind);
  const selected = turnSel?.kind === 'suit' && turnSel.suitId === suit.id && view.status === 'playing' && inTurn;

  return (
    <div className={`suit-card ${seatClass(suit.seat)} ${down ? 'down' : ''} ${active || selected ? 'active' : ''}`}>
      <div className="suit-head">
        <div>
          <div className="suit-label">{suit.label}</div>
          <div className="muted small">
            {b.chassisName} {b.grade} {b.version} · {b.points} pts · {b.scale}
          </div>
        </div>
        <div className="badges">
          {selected && <span className="badge badge-active">Selected</span>}
          {suit.status === 'wreck' && <span className="badge badge-wreck">Wreck {suit.wreckHull}</span>}
          {suit.status === 'removed' && <span className="badge badge-wreck">Removed</span>}
          {!down && suit.band !== 'grounded' && <span className="badge badge-air">✈ {bandLabel(catalog, suit.band)}</span>}
          {!down && suit.coolingExempt && <span className="badge badge-cool">❄ Exempt</span>}
        </div>
      </div>

      {!down && (
        <>
          <div className="hull-row">
            <span className="stat-name">Hull</span>
            <div className="bar">
              <div className={`bar-fill ${hullPct <= 34 ? 'low' : hullPct <= 67 ? 'mid' : ''}`} style={{ width: `${hullPct}%` }} />
            </div>
            <span className="stat-val">
              {suit.hull}/{b.stats.hull}
            </span>
          </div>
          <div className="stat-grid">
            <div className={`stat heat ${heatClass(suit.heat)}`}>
              <span className="stat-name">Heat</span>
              <span className="stat-big">{suit.heat}</span>
            </div>
            <div className="stat">
              <span className="stat-name">Armor</span>
              <span className="stat-big">
                {armor}
                {effectTotal(suit, 'armor') !== 0 && <sup>*</sup>}
              </span>
            </div>
            <div className="stat">
              <span className="stat-name">Shielding</span>
              <span className="stat-big">
                {shield}d6 <small>{b.stats.shieldingTarget}+</small>
              </span>
            </div>
            <div className="stat">
              <span className="stat-name">Move</span>
              <span className="stat-big">
                {move}" <small>J{b.stats.jump}</small>
              </span>
            </div>
            <div className="stat">
              <span className="stat-name">Acts</span>
              <span className="stat-big">{suit.activations}</span>
            </div>
          </div>
          {suit.effects.length > 0 && (
            <div className="effects">
              {suit.effects.map((e) => (
                <span key={e.id} className="chip">
                  {e.amount >= 0 ? '+' : ''}
                  {e.amount} {e.stat === 'shieldingDice' ? 'Shield dice' : e.stat} · {e.source} ·{' '}
                  {e.expires.kind === 'round' ? 'end of round' : e.expires.kind === 'turn' ? 'end of turn' : e.expires.kind === 'phase' ? 'this phase' : 'manual'}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {showOrders && (
        <>
          <button className="link small" onClick={() => setOpen(!open)}>
            {open ? '▾ Hide orders' : `▸ Orders (${b.orders.length})${suit.disabled.length ? ` · ${suit.disabled.length} disabled` : ''}`}
          </button>
          {open && (
            <div className="order-list compact">
              {b.orders.map((o) => {
                const a = avail[o.key];
                return (
                  <div key={o.key} className={`order-row ${a && !a.ok ? 'unavailable' : ''}`}>
                    <div>
                      <strong>{o.name}</strong> <span className="muted small">({o.source})</span>
                      <div className="muted small">{describeSteps(o.steps)}</div>
                    </div>
                    <div className="order-meta">
                      <span title="Phase">P{o.phase}</span>
                      <span title="Weight">W{o.weight}</span>
                      {a && !a.ok && <span className="warn small">{a.reason}</span>}
                    </div>
                  </div>
                );
              })}
              {b.counterattacks.map((c) => (
                <div key={c.key} className={`order-row counter ${suit.disabled.includes(c.key) ? 'unavailable' : ''}`}>
                  <div>
                    <strong>{c.name}</strong> <span className="muted small">(counterattack · {c.source})</span>
                    <div className="muted small">{c.effect}</div>
                    <div className="muted small">
                      Uses this round: {suit.uses[c.key] ?? 0}/{c.usesPerRound ?? '∞'} · heat +{c.heatCost} · resolve manually with the host (v1)
                    </div>
                  </div>
                  <div className="order-meta">
                    <span>W{c.weight}</span>
                    {suit.disabled.includes(c.key) && <span className="warn small">Disabled by heat</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
