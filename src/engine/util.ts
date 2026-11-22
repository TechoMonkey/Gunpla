import type { BuiltOrder } from './builder';
import type { Band, Catalog, FlightBandInfo, StatKey } from './schema';
import type { EngineContext, LogKind, MatchState, Prompt, Seat, SuitState, SuitStats } from './types';

export function newId(s: MatchState, prefix: string): string {
  s.seq += 1;
  return `${prefix}${s.seq}`;
}

export function log(s: MatchState, kind: LogKind, text: string, seat?: Seat): void {
  s.log.push({ n: s.log.length + 1, round: s.round, turn: s.turn?.number ?? 0, kind, text, seat });
}

export function teamName(s: MatchState, seat: Seat): string {
  return s.teams[seat].name || (seat === 'p1' ? 'Player 1' : 'Player 2');
}

export function getSuit(s: MatchState, id: string): SuitState | undefined {
  return s.suits.find((x) => x.id === id);
}

export function suitsOf(s: MatchState, seat: Seat): SuitState[] {
  return s.suits.filter((x) => x.seat === seat);
}

export function operational(s: MatchState, seat: Seat): SuitState[] {
  return s.suits.filter((x) => x.seat === seat && x.status === 'operational');
}

export function bandInfo(catalog: Catalog, band: Band): FlightBandInfo {
  return catalog.rules.flightBands[band];
}

export function effectTotal(suit: SuitState, stat: StatKey): number {
  return suit.effects.filter((e) => e.stat === stat).reduce((sum, e) => sum + e.amount, 0);
}

export function currentArmor(suit: SuitState): number {
  return Math.max(0, suit.build.stats.armor + effectTotal(suit, 'armor'));
}

export function currentShieldingDice(catalog: Catalog, suit: SuitState): number {
  return Math.max(0, suit.build.stats.shieldingDice + effectTotal(suit, 'shieldingDice') + bandInfo(catalog, suit.band).shieldingBonus);
}

export function currentMovement(suit: SuitState): number {
  return Math.max(0, suit.build.stats.movement + effectTotal(suit, 'movement'));
}

export function findOrder(suit: SuitState, key: string): BuiltOrder | undefined {
  return suit.build.orders.find((o) => o.key === key);
}

export function orderAvailability(suit: SuitState, order: BuiltOrder): { ok: boolean; reason?: string } {
  if (suit.status !== 'operational') return { ok: false, reason: 'Defeated' };
  if (suit.disabled.includes(order.key)) return { ok: false, reason: 'Disabled by heat' };
  if (order.usesPerRound !== undefined && (suit.uses[order.key] ?? 0) >= order.usesPerRound) {
    return { ok: false, reason: order.usesPerRound === 1 ? 'Already used this round' : 'No uses left this round' };
  }
  if (order.steps.some((st) => st.type === 'enableFlight')) {
    if (!suit.build.canFly) return { ok: false, reason: 'No Flight capability' };
    if (suit.band !== 'grounded' || suit.flightEnabled) return { ok: false, reason: 'Already airborne' };
  }
  return { ok: true };
}

export function emptyStats(): SuitStats {
  return {
    ordersUsed: {},
    attacksMade: 0,
    damageDealt: 0,
    damageTaken: 0,
    heatChecks: 0,
    heatDamage: 0,
    ordersDisabled: 0,
    ordersCanceled: 0,
    peakHeat: 0,
  };
}

export function setHeat(suit: SuitState, heat: number): void {
  suit.heat = Math.max(0, heat);
  if (suit.heat > suit.stats.peakHeat) suit.stats.peakHeat = suit.heat;
}

// ---------------------------------------------------------------------------
// Re-entrant input helpers.
//
// A stage function is re-run from the top every time new input arrives. Each input
// it needs (a die roll, a player's choice) is requested by a unique tag and the
// answer is remembered in `s.memo` until the stage completes. A helper returns
// `undefined` while the input is still outstanding, and the stage then stops.
// ---------------------------------------------------------------------------

export function ask<T>(s: MatchState, tag: string, make: () => Omit<Prompt, 'id' | 'tag' | 'answer'>): T | undefined {
  if (tag in s.memo) return s.memo[tag] as T;
  const existing = s.prompts.find((p) => p.tag === tag);
  if (existing) {
    if (existing.answer === undefined) return undefined;
    s.memo[tag] = existing.answer;
    s.prompts = s.prompts.filter((p) => p !== existing);
    return existing.answer as T;
  }
  s.prompts.push({ ...make(), id: newId(s, 'q'), tag });
  return undefined;
}

export function rollDice(
  s: MatchState,
  ctx: EngineContext,
  tag: string,
  seat: Seat,
  count: number,
  title: string,
  target?: number,
  detail?: string,
): number[] | undefined {
  if (tag in s.memo) return s.memo[tag] as number[];
  if (count <= 0) {
    s.memo[tag] = [];
    return [];
  }
  if (s.settings.diceMode === 'software') {
    const r = Array.from({ length: count }, () => ctx.rng.int(1, 6));
    s.memo[tag] = r;
    return r;
  }
  return ask<number[]>(s, tag, () => ({ seat, kind: 'dice', count, title, target, detail }));
}

/** Software random integer (always digital, even in physical-dice mode), memoised by tag. */
export function randomInt(s: MatchState, ctx: EngineContext, tag: string, min: number, max: number): number {
  if (tag in s.memo) return s.memo[tag] as number;
  const r = ctx.rng.int(min, max);
  s.memo[tag] = r;
  return r;
}

export function fmtDice(d: number[]): string {
  return d.length ? `[${d.join(', ')}]` : '[]';
}

export function fmtInches(n: number): string {
  return `${Math.round(n * 100) / 100}"`;
}
