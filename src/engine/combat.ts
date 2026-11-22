// Attack resolution (§7), heat (§10–11), cooling (§12), defeat and victory (§15).
import { hitRequirement, type BuiltOrder, type BuiltStep } from './builder';
import { BANDS, type Band, type Catalog } from './schema';
import type { EngineContext, MatchState, Seat, SuitState } from './types';
import { otherSeat, SEATS } from './types';
import {
  ask,
  bandInfo,
  currentArmor,
  currentShieldingDice,
  fmtDice,
  fmtInches,
  log,
  operational,
  randomInt,
  rollDice,
  setHeat,
  teamName,
} from './util';

// ----- Heat ---------------------------------------------------------------

/** End-of-activation heat (§10). `activations` includes the activation that just ended. */
export function activationHeat(heat: number, activations: number): number {
  if (activations <= 1) return heat;
  return heat === 0 ? 1 : heat * 2;
}

/** Cooling calculation (§12). Halving rounds down. */
export function cooledHeat(heat: number, cooling: { kind: 'subtract'; amount: number } | { kind: 'halve' }): number {
  return cooling.kind === 'halve' ? Math.floor(heat / 2) : Math.max(0, heat - cooling.amount);
}

export function heatCheckRow(catalog: Catalog, heat: number) {
  return catalog.rules.heatCheckTable.find((r) => heat >= r.minHeat && (r.maxHeat === null || heat <= r.maxHeat));
}

/** What a heat-check d6 result does at a given heat (§11). */
export function heatCheckOutcome(catalog: Catalog, heat: number, roll: number): { damage: boolean; disable: boolean } {
  const row = heatCheckRow(catalog, heat);
  if (!row || heat <= 0) return { damage: false, disable: false };
  return { damage: roll <= row.damageOn, disable: roll <= row.disableOn };
}

/** Entries that heat can disable: normal orders and counterattacks, excluding protected ones and those already disabled. */
export function disableableKeys(suit: SuitState): string[] {
  const orders = suit.build.orders.filter((o) => !o.protected && !suit.disabled.includes(o.key)).map((o) => o.key);
  const counters = suit.build.counterattacks.filter((c) => !suit.disabled.includes(c.key)).map((c) => c.key);
  return [...orders, ...counters];
}

export function entryName(suit: SuitState, key: string): string {
  const o = suit.build.orders.find((x) => x.key === key);
  if (o) return `${o.name} (${o.source})`;
  const c = suit.build.counterattacks.find((x) => x.key === key);
  if (c) return `${c.name} (${c.source}, counterattack)`;
  return key;
}

/** Applies a rolled heat check. Software picks the disabled entry at random. */
export function applyHeatCheck(s: MatchState, ctx: EngineContext, suit: SuitState, roll: number, tag: string): void {
  const heat = suit.heat;
  const out = heatCheckOutcome(ctx.catalog, heat, roll);
  suit.stats.heatChecks += 1;
  const parts: string[] = [`🔥 Heat check for ${suit.label} at heat ${heat}: rolled ${roll}`];
  if (!out.damage && !out.disable) parts.push('— no effect.');
  if (out.damage) {
    const dmg = ctx.catalog.rules.heatCheckDamage;
    suit.hull = Math.max(0, suit.hull - dmg);
    suit.stats.heatDamage += dmg;
    suit.stats.damageTaken += dmg;
    parts.push(`— takes ${dmg} direct damage (Hull ${suit.hull}).`);
  }
  if (out.disable) {
    const pool = disableableKeys(suit);
    if (pool.length) {
      const idx = randomInt(s, ctx, `${tag}:pick`, 0, pool.length - 1);
      const key = pool[idx];
      suit.disabled.push(key);
      suit.stats.ordersDisabled += 1;
      parts.push(`— ${entryName(suit, key)} is disabled by heat.`);
    } else {
      parts.push('— no eligible order left to disable.');
    }
  }
  log(s, 'heat', parts.join(' '), suit.seat);
}

// ----- Defeat & victory ---------------------------------------------------

/** Converts operational suits at 0 Hull into wrecks (§15) and rolls airborne crash scatter. */
export function processDefeats(s: MatchState, ctx: EngineContext): void {
  for (const suit of s.suits) {
    if (suit.status !== 'operational' || suit.hull > 0) continue;
    suit.status = 'wreck';
    suit.hull = 0;
    suit.wreckHull = ctx.catalog.rules.wreck.hull;
    const band = suit.band;
    log(s, 'damage', `💥 ${suit.label} (${teamName(s, suit.seat)}) is defeated and becomes a wreck.`, suit.seat);
    if (band !== 'grounded') {
      const crash = ctx.catalog.rules.crash[band as Exclude<Band, 'grounded'>];
      const dir = randomInt(s, ctx, `crash:${suit.id}:dir`, 0, 359);
      const dist = randomInt(s, ctx, `crash:${suit.id}:dist`, 0, crash.maxDistance);
      suit.wreckHull = Math.max(0, suit.wreckHull - crash.impact);
      log(
        s,
        'damage',
        `🪂 Crash from ${bandInfo(ctx.catalog, band).label}: scatter ${dir}° (from your reference table edge), up to ${dist}". ` +
          `Impact ${crash.impact} direct damage to the falling wreck (Wreck Hull ${suit.wreckHull}) and to the first Gunpla or terrain struck — apply that with the host Adjust panel.` +
          (suit.wreckHull <= 0 ? ' The wreck is destroyed on impact.' : ''),
        suit.seat,
      );
      if (suit.wreckHull <= 0) suit.status = 'removed';
    }
    suit.band = 'grounded';
    suit.flightEnabled = false;
  }
}

export function finishMatch(s: MatchState, winner: Seat | null, reason: string): void {
  s.status = 'finished';
  s.stage = { kind: 'finished' };
  s.prompts = [];
  s.result = { winner, reason };
  log(s, 'victory', winner ? `🏆 ${teamName(s, winner)} wins — ${reason}.` : `🤝 The match is a draw — ${reason}.`);
}

export function decideByVp(s: MatchState, reason: string): void {
  const a = s.teams.p1.vp;
  const b = s.teams.p2.vp;
  if (a === b) finishMatch(s, null, `${reason}; victory points tied ${a}–${b}`);
  else finishMatch(s, a > b ? 'p1' : 'p2', `${reason}; victory points ${Math.max(a, b)}–${Math.min(a, b)}`);
}

/** Team-defeat victory check (§15). Returns true if the match ended. */
export function checkVictory(s: MatchState): boolean {
  if (s.status !== 'playing') return s.status === 'finished';
  const alive = SEATS.map((seat) => operational(s, seat).length > 0);
  if (alive[0] && alive[1]) return false;
  if (!alive[0] && !alive[1]) decideByVp(s, 'both teams were completely defeated');
  else {
    const winner: Seat = alive[0] ? 'p1' : 'p2';
    finishMatch(s, winner, `${teamName(s, otherSeat(winner))} was completely defeated`);
  }
  return true;
}

// ----- Attacks ------------------------------------------------------------

type AttackStep = Extract<BuiltStep, { type: 'rangedAttack' | 'meleeAttack' }>;

/**
 * Resolves one attack step. Re-entrant: returns false while waiting on input, true when finished.
 * Measuring stays on the tabletop: the attacker reports the horizontal distance; the
 * software adds the altitude difference between flight bands and applies range bands.
 */
export function resolveAttackStep(
  s: MatchState,
  ctx: EngineContext,
  suit: SuitState,
  order: BuiltOrder,
  tag: string,
  step: AttackStep,
): boolean {
  const melee = step.type === 'meleeAttack';
  const rules = ctx.catalog.rules;
  const attackerBand = bandInfo(ctx.catalog, suit.band);
  const restricted = suit.band === 'high' && !step.allowsHighAltitudeGroundAttack;
  const enemies = operational(s, otherSeat(suit.seat));
  const candidates = enemies.filter((e) => !(restricted && e.band === 'grounded'));

  if (!candidates.length) {
    log(s, 'info', `${order.name}: no legal target — the attack step is spent.`, suit.seat);
    return true;
  }

  const targetId = ask<string>(s, `${tag}:target`, () => ({
    seat: suit.seat,
    kind: 'choice',
    title: `${suit.label} — ${order.name}: choose a target`,
    detail:
      (melee ? `Melee reach ${step.reach}". ` : '') +
      (restricted ? 'At High-altitude this order cannot target grounded suits. ' : '') +
      'Choose "No legal target" if nothing is in line of sight / range.',
    options: [
      ...candidates.map((c) => ({ value: c.id, label: `${c.label} (${bandInfo(ctx.catalog, c.band).label}, Hull ${c.hull})` })),
      { value: 'none', label: 'No legal target (step is spent)' },
    ],
  }));
  if (targetId === undefined) return false;
  const target = s.suits.find((x) => x.id === targetId);
  if (targetId === 'none' || !target || target.status !== 'operational') {
    log(s, 'info', `${suit.label}'s ${order.name}: no legal target — the attack step is spent.`, suit.seat);
    return true;
  }

  const altDiff = Math.abs(attackerBand.altitude - bandInfo(ctx.catalog, target.band).altitude);
  const horizontal = ask<number>(s, `${tag}:distance`, () => ({
    seat: suit.seat,
    kind: 'number',
    title: `Measure ${suit.label} → ${target.label} (center to center, horizontal)`,
    detail:
      altDiff > 0
        ? `Enter the horizontal distance only — the software adds the ${altDiff}" altitude difference between flight bands.`
        : 'Enter the distance in inches.',
    min: 0,
    max: 200,
    unit: 'inches',
  }));
  if (horizontal === undefined) return false;
  const distance = horizontal + altDiff;

  let hit: number | null;
  if (melee) hit = distance <= step.reach ? step.hit : null;
  else hit = hitRequirement(step.rangeProfile ?? [], distance, attackerBand.rangeBonus);
  if (hit === null) {
    log(
      s,
      'info',
      `${suit.label}'s ${order.name}: ${target.label} is out of ${melee ? 'reach' : 'range'} at ${fmtInches(distance)} — the attack step is spent.`,
      suit.seat,
    );
    return true;
  }

  let cover = false;
  if (!melee && !bandInfo(ctx.catalog, target.band).noCover) {
    const c = ask<string>(s, `${tag}:cover`, () => ({
      seat: suit.seat,
      kind: 'choice',
      title: `Is ${target.label} in cover?`,
      detail: `Cover: the target is within 1" of terrain that partially obstructs the shot (+${rules.coverArmorBonus} Armor against ranged attacks).`,
      options: [
        { value: 'no', label: 'No cover' },
        { value: 'yes', label: `In cover (+${rules.coverArmorBonus} Armor)` },
      ],
    }));
    if (c === undefined) return false;
    cover = c === 'yes';
  }

  // v2 hook: counterattack declarations and interception resolve here, after the target
  // is declared and before any attack dice are rolled.

  const atk = rollDice(
    s,
    ctx,
    `${tag}:atk`,
    suit.seat,
    step.dice,
    `${suit.label} — ${order.name}: roll ${step.dice}d6 attack dice (hit on ${hit}+)`,
    hit,
  );
  if (atk === undefined) return false;
  const hits = atk.filter((d) => d >= hit!).length;
  const raw = hits * step.damage;
  const armor = currentArmor(target) + (cover ? rules.coverArmorBonus : 0);
  const afterArmor = Math.max(0, raw - armor);

  let blocks = 0;
  let shieldText = '';
  if (afterArmor > 0) {
    const dice = currentShieldingDice(ctx.catalog, target);
    const need = Math.min(6, target.build.stats.shieldingTarget + step.sp);
    const shd = rollDice(
      s,
      ctx,
      `${tag}:shd`,
      target.seat,
      dice,
      `${target.label}: roll ${dice}d6 Shielding (block on ${need}+)`,
      need,
      step.sp ? `Shield Piercing ${step.sp} raised the requirement from ${target.build.stats.shieldingTarget}+ to ${need}+.` : undefined,
    );
    if (shd === undefined) return false;
    blocks = shd.filter((d) => d >= need).length;
    shieldText = ` Shielding ${dice}d6 at ${need}+${step.sp ? ` (SP ${step.sp})` : ''} rolled ${fmtDice(shd)} → blocks ${blocks}.`;
  }
  const damage = Math.max(0, afterArmor - blocks);

  // Everything gathered — apply.
  target.hull = Math.max(0, target.hull - damage);
  suit.stats.attacksMade += 1;
  suit.stats.damageDealt += damage;
  target.stats.damageTaken += damage;
  log(
    s,
    'roll',
    `🎯 ${suit.label} → ${target.label} with ${order.name} at ${fmtInches(distance)} (hit on ${hit}+): rolled ${fmtDice(atk)} → ${hits} hit${hits === 1 ? '' : 's'} × ${step.damage} = ${raw}.` +
      (raw > 0 ? ` Armor ${armor}${cover ? ' (incl. cover)' : ''} → ${afterArmor}.` : '') +
      shieldText,
    suit.seat,
  );
  log(
    s,
    'damage',
    damage > 0 ? `${target.label} loses ${damage} Hull (now ${target.hull}).` : `${target.label} takes no damage (Hull ${target.hull}).`,
    target.seat,
  );
  processDefeats(s, ctx);
  return true;
}

// ----- Movement -----------------------------------------------------------

export function resolveMoveStep(
  s: MatchState,
  ctx: EngineContext,
  suit: SuitState,
  order: BuiltOrder,
  tag: string,
  allowanceKind: 'full' | 'half',
  movement: number,
): boolean {
  const base = allowanceKind === 'full' ? movement : movement / 2;
  const startBand = suit.band;
  const allowance = base + bandInfo(ctx.catalog, startBand).movementBonus;
  const jump = suit.build.stats.jump;

  if (!suit.flightEnabled) {
    const ans = ask<string>(s, `${tag}:move`, () => ({
      seat: suit.seat,
      kind: 'choice',
      title: `${suit.label} — ${order.name}: move up to ${fmtInches(allowance)}`,
      detail:
        `Free movement along a traversable path. ` +
        (jump > 0 ? `Jump ${jump}: may clear obstacles narrower than ${jump}"; each inch climbed costs 1", descending is free. ` : '') +
        'Move the model on the table, then confirm.',
      options: [{ value: 'done', label: 'Done moving' }],
    }));
    if (ans === undefined) return false;
    log(s, 'info', `${suit.label} moves (up to ${fmtInches(allowance)}).`, suit.seat);
    return true;
  }

  const rules = ctx.catalog.rules;
  const from = bandInfo(ctx.catalog, startBand);
  const options = BANDS.filter((b) => b !== 'grounded' || suit.build.landingPermitted).map((b) => {
    const info = rules.flightBands[b];
    const cost = Math.abs(info.altitude - from.altitude);
    const left = allowance - cost;
    return {
      value: b,
      label:
        b === startBand
          ? `Stay at ${info.label} — ${fmtInches(allowance)} of horizontal movement`
          : `${b === 'grounded' ? 'Land (Grounded)' : info.label} — costs ${fmtInches(cost)}, ${fmtInches(Math.max(0, left))} left for horizontal movement`,
      disabled: left < 0,
      note: left < 0 ? 'Not enough movement' : undefined,
    };
  });
  const dest = ask<Band>(s, `${tag}:band`, () => ({
    seat: suit.seat,
    kind: 'choice',
    title: `${suit.label} — ${order.name}: flying, ${fmtInches(allowance)} of movement (${from.label})`,
    detail: 'Each inch of altitude change costs 1" of movement. Choose the flight band to end in, then move the model horizontally.',
    options,
  }));
  if (dest === undefined) return false;
  suit.band = dest;
  if (dest === 'grounded') {
    suit.flightEnabled = false;
    log(s, 'info', `${suit.label} lands — Flight switches off.`, suit.seat);
  } else if (dest !== startBand) {
    log(s, 'info', `${suit.label} moves from ${from.label} to ${rules.flightBands[dest].label}.`, suit.seat);
  } else {
    log(s, 'info', `${suit.label} moves at ${from.label} (up to ${fmtInches(allowance)}).`, suit.seat);
  }
  return true;
}
