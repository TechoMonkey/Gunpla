// Match state: everything the host stores about a game in progress.
import type { SuitBuild } from './builder';
import type { Band, Catalog, Roster, StatKey } from './schema';

export type Seat = 'p1' | 'p2';
export const SEATS: Seat[] = ['p1', 'p2'];
export const otherSeat = (s: Seat): Seat => (s === 'p1' ? 'p2' : 'p1');

export type DiceMode = 'software' | 'physical';

export interface MatchSettings {
  name: string;
  pointsBudget: number;
  diceMode: DiceMode;
  battlefield: string; // key into rules.battlefields
  rounds: number;
  scaleNote: string;
}

export type EffectExpiry =
  | { kind: 'phase' }
  | { kind: 'turn'; turn: number } // expires at the end of this global turn number
  | { kind: 'round'; round: number } // expires at the end of this round
  | { kind: 'manual' }; // host-added, removed by hand

export interface Effect {
  id: string;
  stat: StatKey;
  amount: number;
  source: string;
  expires: EffectExpiry;
}

export type SuitStatus = 'operational' | 'wreck' | 'removed';

export interface SuitStats {
  ordersUsed: Record<string, number>;
  attacksMade: number;
  damageDealt: number;
  damageTaken: number;
  heatChecks: number;
  heatDamage: number;
  ordersDisabled: number;
  ordersCanceled: number;
  peakHeat: number;
}

export interface SuitState {
  id: string;
  seat: Seat;
  label: string;
  build: SuitBuild;
  hull: number;
  heat: number;
  band: Band;
  flightEnabled: boolean;
  status: SuitStatus;
  wreckHull: number;
  deployed: boolean;
  /** Normal activations committed this round (canceled ones count). */
  activations: number;
  coolingExempt: boolean;
  /** Order/counterattack keys disabled by heat. */
  disabled: string[];
  /** Per-round uses spent, by order/counterattack key. */
  uses: Record<string, number>;
  effects: Effect[];
  stats: SuitStats;
}

export interface TeamState {
  seat: Seat;
  name: string;
  roster: Roster | null;
  rosterErrors: string[];
  rosterPoints: number;
  ready: boolean;
  allowance: number;
  activationsRemaining: number;
  vp: number;
  zone: string | null;
}

export type Selection = { kind: 'suit'; suitId: string } | { kind: 'pass' } | { kind: 'none' };

export interface QueueItem {
  seat: Seat;
  suitId: string;
  orderKey: string;
  orderName: string;
  phase: number;
  weight: number;
  status: 'pending' | 'done' | 'canceled';
  note?: string;
}

export interface TurnState {
  number: number; // global turn counter (continues across rounds)
  roundTurn: number;
  firstSeat: Seat;
  selections: Partial<Record<Seat, Selection>>;
  locked: Partial<Record<Seat, string>>;
  queue: QueueItem[];
}

export type Stage =
  | { kind: 'building' }
  | { kind: 'rolloff'; attempt: number }
  | { kind: 'zone'; chooser: Seat }
  | { kind: 'placement'; next: Seat }
  | { kind: 'select' }
  | { kind: 'orders' }
  | { kind: 'resolve'; item: number; step: number; part: 'begin' | 'step' | 'heat' | 'check' }
  | { kind: 'turnEnd' }
  | { kind: 'roundEnd'; part: 'heat' | 'objectives' | 'refresh' }
  | { kind: 'finished' };

export interface PromptOption {
  value: string;
  label: string;
  disabled?: boolean;
  note?: string;
}

export type PromptKind = 'dice' | 'choice' | 'number' | 'objectives';

export interface Prompt {
  id: string;
  tag: string;
  seat: Seat;
  kind: PromptKind;
  title: string;
  detail?: string;
  /** dice: how many d6 to enter */
  count?: number;
  /** dice: success threshold shown as a hint */
  target?: number;
  options?: PromptOption[];
  min?: number;
  max?: number;
  unit?: string;
  /** objectives: suits eligible to contribute */
  suits?: { id: string; label: string }[];
  objectives?: number;
  answer?: unknown;
}

export type LogKind = 'info' | 'roll' | 'damage' | 'heat' | 'system' | 'victory' | 'adjust' | 'order';

export interface LogEntry {
  n: number;
  round: number;
  turn: number;
  kind: LogKind;
  text: string;
  seat?: Seat;
}

export interface MatchResult {
  winner: Seat | null;
  reason: string;
}

export interface MatchState {
  id: string;
  createdAt: string;
  settings: MatchSettings;
  status: 'building' | 'deployment' | 'playing' | 'finished';
  stage: Stage;
  round: number;
  turn: TurnState | null;
  tokenHolder: Seat | null;
  teams: Record<Seat, TeamState>;
  suits: SuitState[];
  prompts: Prompt[];
  /** Inputs gathered for the stage currently resolving (cleared when it completes). */
  memo: Record<string, unknown>;
  seq: number;
  log: LogEntry[];
  result: MatchResult | null;
  rolloff: Partial<Record<Seat, number>>;
  objectiveHistory: { round: number; control: (Seat | null)[]; counts: { p1: number; p2: number }[] }[];
  weightedRolls: number;
}

export interface Rng {
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
}

export interface EngineContext {
  catalog: Catalog;
  rng: Rng;
}

export type Actor = Seat | 'host';

export interface AdjustChanges {
  hull?: number;
  heat?: number;
  band?: Band;
  flightEnabled?: boolean;
  status?: SuitStatus;
  wreckHull?: number;
  activations?: number;
  coolingExempt?: boolean;
  disabled?: string[];
  uses?: Record<string, number>;
  addEffect?: { stat: StatKey; amount: number; until: 'turn' | 'round' | 'manual'; note?: string };
  removeEffectId?: string;
}

export type Command =
  | { type: 'setRoster'; roster: Roster }
  | { type: 'setReady'; ready: boolean }
  | { type: 'select'; suitId: string }
  | { type: 'pass' }
  | { type: 'lockOrder'; orderKey: string }
  | { type: 'unlockOrder' }
  | { type: 'answer'; promptId: string; value: unknown }
  | { type: 'adjust'; suitId: string; changes: AdjustChanges; note?: string }
  | { type: 'adjustTeam'; seat: Seat; vp?: number; activationsRemaining?: number; note?: string }
  | { type: 'endMatch'; winner: Seat | null; reason: string };

export type CommandResult = { ok: true } | { ok: false; error: string };
