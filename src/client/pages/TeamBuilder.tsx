import { useEffect, useMemo, useState } from 'react';
import { buildSuit, describeRange, describeSteps, validateRoster } from '../../engine/builder';
import type { Category, Roster, RosterSuit } from '../../engine/schema';
import { GRADE_NAMES } from '../../engine/schema';
import type { Seat } from '../../engine/types';
import { otherSeat } from '../../engine/types';
import type { RosterList } from '../../shared/protocol';
import { call, loadLocal, saveLocal, send, toast } from '../net';
import { sideName, useMatchCtx } from '../lib';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'weapon', label: 'Weapons' },
  { key: 'shield', label: 'Shield' },
  { key: 'upgrade', label: 'Upgrades' },
];

export function TeamBuilder({ seat }: { seat: Seat }) {
  const { update, view, catalog } = useMatchCtx();
  const team = view.teams[seat];
  const draftKey = `gunpla:draft:${view.id}:${seat}`;
  const [roster, setRoster] = useState<Roster>(() => team.roster ?? loadLocal<Roster>(draftKey) ?? { name: '', suits: [] });
  const [library, setLibrary] = useState<RosterList | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => saveLocal(draftKey, roster), [draftKey, roster]);
  useEffect(() => {
    void call<RosterList>('rosters:list').then((r) => r.ok && setLibrary(r));
  }, []);

  const result = useMemo(() => validateRoster(catalog, roster, view.settings.pointsBudget), [catalog, roster, view.settings.pointsBudget]);
  const opp = otherSeat(seat);
  const chassisList = Object.values(catalog.chassis);

  const setSuit = (i: number, s: RosterSuit) => setRoster({ ...roster, suits: roster.suits.map((x, j) => (j === i ? s : x)) });
  const addSuit = () => {
    const c = chassisList[0];
    const letter = String.fromCharCode(65 + roster.suits.length);
    setRoster({ ...roster, suits: [...roster.suits, { label: `${c.name} ${letter}`, chassis: c.id, equipment: [] }] });
  };

  const submit = async () => {
    setBusy(true);
    if (await send({ type: 'setRoster', roster })) await send({ type: 'setReady', ready: true });
    setBusy(false);
  };

  const saveToLibrary = async () => {
    const r = await call('rosters:save', roster);
    if (!r.ok) toast(r.error);
    else {
      toast(`Saved "${roster.name}" to the host's team library`, 'info');
      void call<RosterList>('rosters:list').then((x) => x.ok && setLibrary(x));
    }
  };

  if (team.ready) {
    return (
      <div className="panel">
        <h2>Team submitted ✓</h2>
        <p>
          <strong>{team.name}</strong> — {team.rosterPoints} / {view.settings.pointsBudget} points, {team.roster?.suits.length} Gunpla.
        </p>
        <p className="muted">
          {view.teams[opp].ready ? `${sideName(update, opp)} is ready too — starting deployment…` : `Waiting for ${sideName(update, opp)} to finish their team…`}
          {' '}Both teams are revealed together.
        </p>
        <button className="btn" onClick={() => send({ type: 'setReady', ready: false })}>
          Edit team
        </button>
      </div>
    );
  }

  const presets = [...(library?.starter ?? []).map((r) => ({ r, tag: 'Starter' })), ...(library?.saved ?? []).map((r) => ({ r, tag: 'Saved' }))];

  return (
    <div className="builder">
      <div className="panel builder-top">
        <div className="row wrap">
          <label className="field grow">
            <span>Team name</span>
            <input className="input" value={roster.name} maxLength={60} placeholder="e.g. Zeon Strike Team" onChange={(e) => setRoster({ ...roster, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Load a team</span>
            <select
              className="input"
              value=""
              onChange={(e) => {
                const p = presets[Number(e.target.value)];
                if (p) setRoster(structuredClone(p.r));
              }}
            >
              <option value="">Choose…</option>
              {presets.map((p, i) => (
                <option key={i} value={i}>
                  {p.tag}: {p.r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={`points ${result.totalPoints > view.settings.pointsBudget ? 'over' : ''}`}>
          <b>{result.totalPoints}</b> / {view.settings.pointsBudget} points · {roster.suits.length} Gunpla = {roster.suits.length} activation{roster.suits.length === 1 ? '' : 's'} per round
        </div>
        <div className="muted small">
          {view.teams[opp].ready ? `${sideName(update, opp)} is ready.` : `${sideName(update, opp)} is still building.`} Teams stay hidden until both are submitted.
        </div>
      </div>

      {roster.suits.map((s, i) => (
        <SuitEditor
          key={i}
          entry={s}
          onChange={(x) => setSuit(i, x)}
          onRemove={() => setRoster({ ...roster, suits: roster.suits.filter((_, j) => j !== i) })}
          onDuplicate={() => setRoster({ ...roster, suits: [...roster.suits, { ...structuredClone(s), label: `${s.label} copy` }] })}
        />
      ))}

      <button className="btn wide" onClick={addSuit}>
        + Add a Gunpla
      </button>

      <div className="panel">
        {result.errors.length > 0 && (
          <ul className="errors">
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="row wrap">
          <button className="btn primary" disabled={busy || result.errors.length > 0} onClick={submit}>
            Submit team & ready up
          </button>
          <button className="btn" disabled={!roster.name.trim() || !roster.suits.length} onClick={saveToLibrary}>
            Save to team library
          </button>
        </div>
      </div>
    </div>
  );
}

function SuitEditor({ entry, onChange, onRemove, onDuplicate }: { entry: RosterSuit; onChange: (s: RosterSuit) => void; onRemove: () => void; onDuplicate: () => void }) {
  const { catalog } = useMatchCtx();
  const { build, errors } = buildSuit(catalog, entry);
  const chassis = catalog.chassis[entry.chassis];
  const items = Object.values(catalog.equipment);
  const [showOrders, setShowOrders] = useState(false);

  return (
    <div className="panel suit-editor">
      <div className="row wrap">
        <label className="field grow">
          <span>Label</span>
          <input className="input" value={entry.label} maxLength={40} onChange={(e) => onChange({ ...entry, label: e.target.value })} />
        </label>
        <label className="field grow">
          <span>Chassis</span>
          <select className="input" value={entry.chassis} onChange={(e) => onChange({ ...entry, chassis: e.target.value, equipment: [] })}>
            {Object.values(catalog.chassis).map((c) => (
              <option key={c.id} value={c.id}>
                {c.modelNumber ? `${c.modelNumber} ` : ''}
                {c.name} — {GRADE_NAMES[c.grade]} {c.version} ({c.points} pts)
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Model scale</span>
          <input className="input narrow" value={entry.scale ?? ''} placeholder={chassis?.referenceScale} onChange={(e) => onChange({ ...entry, scale: e.target.value || undefined })} />
        </label>
        <div className="row">
          <button className="btn small" onClick={onDuplicate} title="Duplicate">
            ⧉
          </button>
          <button className="btn small danger" onClick={onRemove} title="Remove">
            ✕
          </button>
        </div>
      </div>

      {chassis && (
        <div className="slots">
          {CATEGORIES.map(({ key, label }) => {
            const used = build?.slotsUsed[key] ?? 0;
            const max = chassis.slots[key];
            const equipped = entry.equipment.map((id, idx) => ({ id, idx })).filter(({ id }) => catalog.equipment[id]?.category === key);
            return (
              <div key={key} className="slot-group">
                <div className="slot-head">
                  {label}{' '}
                  <span className={used > max ? 'warn' : 'muted'}>
                    {used}/{max} slots
                  </span>
                </div>
                <div className="chips">
                  {equipped.map(({ id, idx }) => (
                    <span key={idx} className="chip equip">
                      {catalog.equipment[id]?.name} · {catalog.equipment[id]?.points}
                      <button className="chip-x" onClick={() => onChange({ ...entry, equipment: entry.equipment.filter((_, j) => j !== idx) })}>
                        ✕
                      </button>
                    </span>
                  ))}
                  {used < max && (
                    <select
                      className="input small-select"
                      value=""
                      onChange={(e) => e.target.value && onChange({ ...entry, equipment: [...entry.equipment, e.target.value] })}
                    >
                      <option value="">+ Add…</option>
                      {items
                        .filter((it) => it.category === key)
                        .map((it) => {
                          const copies = entry.equipment.filter((x) => x === it.id).length;
                          const incompatible = it.requires.includes('supportsFlightUpgrades') && !chassis.supportsFlightUpgrades;
                          const full = copies >= it.maxCopies;
                          const noRoom = used + it.slotCost > max;
                          return (
                            <option key={it.id} value={it.id} disabled={incompatible || full || noRoom}>
                              {it.name} ({it.points} pts){incompatible ? ' — needs Flight-capable chassis' : full ? ' — already equipped' : noRoom ? ' — no slot room' : ''}
                            </option>
                          );
                        })}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {build && (
        <div className="build-summary">
          <div className="stat-line">
            <span>
              <b>{build.points}</b> pts
            </span>
            <span>Hull {build.stats.hull}</span>
            <span>Armor {build.stats.armor}</span>
            <span>
              Shielding {build.stats.shieldingDice}d6 {build.stats.shieldingTarget}+
            </span>
            <span>Move {build.stats.movement}"</span>
            <span>Jump {build.stats.jump}"</span>
            <span>Cool: {build.cooling.kind === 'halve' ? 'halve heat' : `−${build.cooling.amount} heat`}</span>
            {build.canFly && <span>✈ Flight</span>}
          </div>
          <button className="link small" onClick={() => setShowOrders(!showOrders)}>
            {showOrders ? '▾ Hide' : '▸ Show'} {build.orders.length} orders, {build.counterattacks.length} counterattack{build.counterattacks.length === 1 ? '' : 's'}
          </button>
          {showOrders && (
            <div className="order-list compact">
              {build.orders.map((o) => {
                const ranged = o.steps.find((s) => s.type === 'rangedAttack');
                return (
                  <div key={o.key} className="order-row">
                    <div>
                      <strong>{o.name}</strong> <span className="muted small">({o.source})</span>
                      <div className="muted small">{describeSteps(o.steps)}</div>
                      {ranged && ranged.type === 'rangedAttack' && ranged.rangeProfile && <div className="muted small">Range: {describeRange(ranged.rangeProfile)}</div>}
                    </div>
                    <div className="order-meta">
                      <span>P{o.phase}</span>
                      <span>W{o.weight}</span>
                    </div>
                  </div>
                );
              })}
              {build.counterattacks.map((c) => (
                <div key={c.key} className="order-row counter">
                  <div>
                    <strong>{c.name}</strong> <span className="muted small">(counterattack · {c.source})</span>
                    <div className="muted small">{c.trigger}</div>
                  </div>
                  <div className="order-meta">
                    <span>W{c.weight}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {errors.length > 0 && <div className="warn small">{errors.join(' · ')}</div>}
    </div>
  );
}
