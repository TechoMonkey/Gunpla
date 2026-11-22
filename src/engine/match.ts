// The match state machine: deployment (§3), turn sequence (§4), matching phases (§5),
// order resolution, heat (§10–12), end of round (§17) and victory (§15–16).
//
// `applyCommand` validates a player's command, records it, then calls `advance`, which
// runs the game forward until it needs input from someone (a command or a prompt answer).
import { validateRoster, type BuiltOrder, type SuitBuild } from './builder';
import {
  activationHeat,
  applyHeatCheck,
  checkVictory,
  cooledHeat,
  decideByVp,
  finishMatch,
  processDefeats,
  resolveAttackStep,
  resolveMoveStep,
} from './combat';
import { BANDS, RosterSchema } from './schema';
import {
  otherSeat,
  SEATS,
  type Actor,
  type Command,
  type CommandResult,
  type Effect,
  type EffectExpiry,
  type EngineContext,
  type MatchSettings,
  type MatchState,
  type Prompt,
  type Seat,
  type Stage,
  type SuitState,
  type TeamState,
} from './types';
import {
  ask,
  bandInfo,
  currentArmor,
  currentMovement,
  currentShieldingDice,
  emptyStats,
  findOrder,
  getSuit,
  log,
  newId,
  operational,
  orderAvailability,
  rollDice,
  randomInt,
  setHeat,
  suitsOf,
  teamName,
} from './util';

export function createMatch(id: string, settings: MatchSettings, createdAt: string): MatchState {
  const team = (seat: Seat): TeamState => ({
    seat,
    name: '',
    roster: null,
    rosterErrors: [],
    rosterPoints: 0,
    ready: false,
    allowance: 0,
    activationsRemaining: 0,
    vp: 0,
    zone: null,
  });
  const s: MatchState = {
    id,
    createdAt,
    settings,
    status: 'building',
    stage: { kind: 'building' },
    round: 0,
    turn: null,
    tokenHolder: null,
    teams: { p1: team('p1'), p2: team('p2') },
    suits: [],
    prompts: [],
    memo: {},
    seq: 0,
    log: [],
    result: null,
    rolloff: {},
    objectiveHistory: [],
    weightedRolls: 0,
  };
  log(
    s,
    'system',
    `Match "${settings.name}" created — ${settings.pointsBudget}-point teams, ${settings.diceMode === 'software' ? 'software' : 'physical'} dice, ${settings.rounds} rounds.`,
  );
  return s;
}

export function applyCommand(s: MatchState, actor: Actor, cmd: Command, ctx: EngineContext): CommandResult {
  const error = handle(s, actor, cmd, ctx);
  if (error) return { ok: false, error };
  advance(s, ctx);
  return { ok: true };
}

/** Runs the match forward until it is blocked waiting on a player. */
export function advance(s: MatchState, ctx: EngineContext): void {
  for (let i = 0; i < 10000; i++) {
    if (s.status === 'finished') return;
    if (s.prompts.some((p) => p.answer === undefined)) return;
    if (!runStage(s, ctx)) return;
  }
  throw new Error('The game engine did not settle (possible rules loop)');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function handle(s: MatchState, actor: Actor, cmd: Command, ctx: EngineContext): string | null {
  const seat: Seat | null = actor === 'host' ? null : actor;
  if (s.status === 'finished' && cmd.type !== 'adjust' && cmd.type !== 'adjustTeam') return 'The match has finished';

  switch (cmd.type) {
    case 'setRoster': {
      if (!seat) return 'Only a seated player can submit a team';
      if (s.status !== 'building') return 'Teams are locked once deployment begins';
      const team = s.teams[seat];
      if (team.ready) return 'Click "Edit team" first to change a team that is marked ready';
      const parsed = RosterSchema.safeParse(cmd.roster);
      if (!parsed.success) return 'Invalid team: ' + parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ');
      const r = validateRoster(ctx.catalog, parsed.data, s.settings.pointsBudget);
      team.roster = parsed.data;
      team.name = parsed.data.name;
      team.rosterErrors = r.errors;
      team.rosterPoints = r.totalPoints;
      return null;
    }

    case 'setReady': {
      if (!seat) return 'Only a seated player can do that';
      if (s.status !== 'building') return 'Deployment has already begun';
      const team = s.teams[seat];
      if (cmd.ready) {
        if (!team.roster) return 'Submit a team first';
        if (team.rosterErrors.length) return 'Fix the team errors first: ' + team.rosterErrors.join('; ');
        if (!team.ready) log(s, 'system', `${teamName(s, seat)} is ready (${team.rosterPoints} points, ${team.roster.suits.length} Gunpla).`, seat);
      } else if (team.ready) {
        log(s, 'system', `${teamName(s, seat)} is editing their team.`, seat);
      }
      team.ready = cmd.ready;
      return null;
    }

    case 'select':
    case 'pass': {
      if (!seat) return 'Only a seated player can select';
      if (s.stage.kind !== 'select' || !s.turn) return 'Suits are not being selected right now';
      const expected = nextSelector(s);
      if (seat !== expected) return expected ? `Waiting for ${teamName(s, expected)} to select first` : 'Selections are complete';
      if (cmd.type === 'pass') {
        const elig = passEligibility(s, seat);
        if (!elig.ok) return elig.reason!;
        s.turn.selections[seat] = { kind: 'pass' };
        log(s, 'order', `${teamName(s, seat)} passes, forfeiting one activation.`, seat);
        return null;
      }
      const suit = getSuit(s, cmd.suitId);
      if (!suit || suit.seat !== seat || suit.status !== 'operational') return 'Choose one of your operational Gunpla';
      s.turn.selections[seat] = { kind: 'suit', suitId: suit.id };
      log(s, 'order', `${teamName(s, seat)} selects ${suit.label} (activation ${suit.activations + 1} this round, heat ${suit.heat}).`, seat);
      return null;
    }

    case 'lockOrder': {
      if (!seat) return 'Only a seated player can lock an order';
      if (s.stage.kind !== 'orders' || !s.turn) return 'Orders are not being chosen right now';
      const sel = s.turn.selections[seat];
      if (sel?.kind !== 'suit') return 'You have no Gunpla selected this turn';
      if (s.turn.locked[seat]) return 'Already locked — unlock first to change it';
      const suit = getSuit(s, sel.suitId)!;
      const order = findOrder(suit, cmd.orderKey);
      if (!order) return 'Unknown order';
      const av = orderAvailability(suit, order);
      if (!av.ok) return `${order.name} is unavailable: ${av.reason}`;
      s.turn.locked[seat] = order.key;
      log(s, 'order', `${teamName(s, seat)} has locked in an order.`, seat);
      return null;
    }

    case 'unlockOrder': {
      if (!seat) return 'Only a seated player can unlock';
      if (s.stage.kind !== 'orders' || !s.turn) return 'Too late — orders have been revealed';
      if (!s.turn.locked[seat]) return 'No order is locked';
      delete s.turn.locked[seat];
      log(s, 'order', `${teamName(s, seat)} unlocked their order to change it.`, seat);
      return null;
    }

    case 'answer': {
      const p = s.prompts.find((x) => x.id === cmd.promptId);
      if (!p || p.answer !== undefined) return 'That question has already been answered';
      if (actor !== 'host' && actor !== p.seat) return 'That question is for the other player';
      const v = validateAnswer(s, p, cmd.value);
      if ('error' in v) return v.error;
      p.answer = v.value;
      if (actor === 'host') log(s, 'adjust', `Host answered "${p.title}" for ${teamName(s, p.seat)}.`);
      return null;
    }

    case 'adjust':
      if (actor !== 'host') return 'Only the host can adjust stats';
      return adjustSuit(s, ctx, cmd);

    case 'adjustTeam': {
      if (actor !== 'host') return 'Only the host can adjust teams';
      const team = s.teams[cmd.seat];
      if (!team) return 'Unknown team';
      const notes: string[] = [];
      if (cmd.vp !== undefined) {
        notes.push(`VP ${team.vp} → ${cmd.vp}`);
        team.vp = Math.max(0, Math.round(cmd.vp));
      }
      if (cmd.activationsRemaining !== undefined) {
        notes.push(`activations left ${team.activationsRemaining} → ${cmd.activationsRemaining}`);
        team.activationsRemaining = Math.max(0, Math.round(cmd.activationsRemaining));
      }
      if (!notes.length) return 'Nothing to change';
      log(s, 'adjust', `🛠 Host adjusts ${teamName(s, cmd.seat)}: ${notes.join(', ')}${cmd.note ? ` — ${cmd.note}` : ''}.`);
      return null;
    }

    case 'endMatch':
      if (actor !== 'host') return 'Only the host can end the match';
      finishMatch(s, cmd.winner, cmd.reason || 'ended by the host');
      return null;
  }
  return 'Unknown command';
}

function adjustSuit(s: MatchState, ctx: EngineContext, cmd: Extract<Command, { type: 'adjust' }>): string | null {
  const suit = getSuit(s, cmd.suitId);
  if (!suit) return 'Unknown Gunpla';
  const c = cmd.changes ?? {};
  const notes: string[] = [];
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

  if (num(c.hull)) {
    notes.push(`Hull ${suit.hull} → ${Math.max(0, Math.round(c.hull!))}`);
    suit.hull = Math.max(0, Math.round(c.hull!));
  }
  if (num(c.heat)) {
    notes.push(`heat ${suit.heat} → ${Math.max(0, Math.round(c.heat!))}`);
    setHeat(suit, Math.round(c.heat!));
  }
  if (c.band && BANDS.includes(c.band)) {
    notes.push(`band ${bandInfo(ctx.catalog, suit.band).label} → ${bandInfo(ctx.catalog, c.band).label}`);
    suit.band = c.band;
    suit.flightEnabled = c.band !== 'grounded';
  }
  if (typeof c.flightEnabled === 'boolean' && c.flightEnabled !== suit.flightEnabled) {
    notes.push(`Flight ${c.flightEnabled ? 'on' : 'off'}`);
    suit.flightEnabled = c.flightEnabled;
    if (!c.flightEnabled) suit.band = 'grounded';
  }
  if (c.status && ['operational', 'wreck', 'removed'].includes(c.status) && c.status !== suit.status) {
    notes.push(`status ${suit.status} → ${c.status}`);
    if (c.status === 'wreck' && suit.status === 'operational') suit.wreckHull = ctx.catalog.rules.wreck.hull;
    if (c.status === 'operational' && suit.hull <= 0) suit.hull = 1;
    if (c.status !== 'operational') suit.hull = 0;
    suit.status = c.status;
  }
  if (num(c.wreckHull)) {
    notes.push(`Wreck Hull ${suit.wreckHull} → ${Math.max(0, Math.round(c.wreckHull!))}`);
    suit.wreckHull = Math.max(0, Math.round(c.wreckHull!));
    if (suit.wreckHull === 0 && suit.status === 'wreck') {
      suit.status = 'removed';
      notes.push('wreck removed');
    }
  }
  if (num(c.activations)) {
    notes.push(`activations this round ${suit.activations} → ${Math.max(0, Math.round(c.activations!))}`);
    suit.activations = Math.max(0, Math.round(c.activations!));
  }
  if (typeof c.coolingExempt === 'boolean' && c.coolingExempt !== suit.coolingExempt) {
    notes.push(c.coolingExempt ? 'cooling exemption granted' : 'cooling exemption removed');
    suit.coolingExempt = c.coolingExempt;
  }
  if (Array.isArray(c.disabled)) {
    const valid = new Set([...suit.build.orders.map((o) => o.key), ...suit.build.counterattacks.map((x) => x.key)]);
    const next = c.disabled.filter((k) => valid.has(k));
    notes.push(`disabled entries: ${next.length ? next.length : 'none'}`);
    suit.disabled = next;
  }
  if (c.uses && typeof c.uses === 'object') {
    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries(c.uses)) if (num(v) && v > 0) next[k] = Math.round(v);
    notes.push('per-round uses updated');
    suit.uses = next;
  }
  if (c.addEffect && num(c.addEffect.amount) && ['armor', 'shieldingDice', 'movement'].includes(c.addEffect.stat)) {
    const until = c.addEffect.until;
    const expires: EffectExpiry =
      until === 'turn' ? { kind: 'turn', turn: s.turn?.number ?? 0 } : until === 'round' ? { kind: 'round', round: s.round } : { kind: 'manual' };
    suit.effects.push({
      id: newId(s, 'e'),
      stat: c.addEffect.stat,
      amount: Math.round(c.addEffect.amount),
      source: c.addEffect.note || 'Host adjustment',
      expires,
    });
    notes.push(`${c.addEffect.amount >= 0 ? '+' : ''}${c.addEffect.amount} ${c.addEffect.stat} (${until === 'manual' ? 'until removed' : `until end of ${until}`})`);
  }
  if (c.removeEffectId) {
    const before = suit.effects.length;
    suit.effects = suit.effects.filter((e) => e.id !== c.removeEffectId);
    if (suit.effects.length !== before) notes.push('effect removed');
  }
  if (!notes.length) return 'Nothing to change';
  log(s, 'adjust', `🛠 Host adjusts ${suit.label}: ${notes.join(', ')}${cmd.note ? ` — ${cmd.note}` : ''}.`, suit.seat);
  if (s.status === 'playing') {
    processDefeats(s, ctx);
    checkVictory(s);
  }
  return null;
}

function validateAnswer(s: MatchState, p: Prompt, value: unknown): { value: unknown } | { error: string } {
  switch (p.kind) {
    case 'dice': {
      if (!Array.isArray(value) || value.length !== p.count) return { error: `Enter exactly ${p.count} dice` };
      if (!value.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) return { error: 'Each die must be a whole number from 1 to 6' };
      return { value: value.slice() };
    }
    case 'choice': {
      const opt = p.options?.find((o) => o.value === value);
      if (!opt) return { error: 'Pick one of the listed options' };
      if (opt.disabled) return { error: opt.note || 'That option is not allowed' };
      return { value };
    }
    case 'number': {
      const n = typeof value === 'string' ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) return { error: 'Enter a number' };
      if (p.min !== undefined && n < p.min) return { error: `Must be at least ${p.min}` };
      if (p.max !== undefined && n > p.max) return { error: `Must be at most ${p.max}` };
      return { value: n };
    }
    case 'objectives': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Invalid objective report' };
      const allowed = new Set((p.suits ?? []).map((x) => x.id));
      const out: Record<string, number> = {};
      for (const [id, obj] of Object.entries(value as Record<string, unknown>)) {
        if (!allowed.has(id)) return { error: 'Report only your own eligible Gunpla' };
        if (!Number.isInteger(obj) || (obj as number) < 0 || (obj as number) > (p.objectives ?? 0)) return { error: 'Invalid objective number' };
        out[id] = obj as number;
      }
      return { value: out };
    }
  }
  void s;
  return { error: 'Unknown question type' };
}

// ---------------------------------------------------------------------------
// Turn helpers
// ---------------------------------------------------------------------------

export function canAct(s: MatchState, seat: Seat): boolean {
  return s.teams[seat].activationsRemaining > 0 && operational(s, seat).length > 0;
}

/** The seat expected to select next this turn, or null when both have. */
export function nextSelector(s: MatchState): Seat | null {
  if (!s.turn) return null;
  for (const seat of [s.turn.firstSeat, otherSeat(s.turn.firstSeat)]) {
    if (s.turn.selections[seat] === undefined) return seat;
  }
  return null;
}

/** §1: a team may pass only once every surviving suit has taken a normal activation this round. */
export function passEligibility(s: MatchState, seat: Seat): { ok: boolean; reason?: string } {
  const waiting = operational(s, seat).filter((x) => x.activations === 0);
  if (waiting.length) {
    return { ok: false, reason: `You can pass only after every surviving Gunpla has activated this round (still waiting: ${waiting.map((x) => x.label).join(', ')})` };
  }
  return { ok: true };
}

function goto(s: MatchState, stage: Stage): void {
  s.stage = stage;
  s.memo = {};
}

function newSuit(seat: Seat, index: number, build: SuitBuild): SuitState {
  return {
    id: `${seat}-${index + 1}`,
    seat,
    label: build.label,
    build,
    hull: build.stats.hull,
    heat: 0,
    band: build.startingBand,
    flightEnabled: build.startingBand !== 'grounded',
    status: 'operational',
    wreckHull: 0,
    deployed: false,
    activations: 0,
    coolingExempt: false,
    disabled: [],
    uses: {},
    effects: [],
    stats: emptyStats(),
  };
}

function newTurn(s: MatchState, number: number, roundTurn: number): void {
  s.turn = { number, roundTurn, firstSeat: s.tokenHolder!, selections: {}, locked: {}, queue: [] };
  goto(s, { kind: 'select' });
}

function expireEffects(s: MatchState, pred: (e: Effect['expires']) => boolean): void {
  for (const suit of s.suits) {
    const ending = suit.effects.filter((e) => pred(e.expires));
    if (!ending.length) continue;
    suit.effects = suit.effects.filter((e) => !pred(e.expires));
    if (suit.status === 'operational') {
      log(s, 'info', `${suit.label}: ${ending.map((e) => `${e.source} (${e.amount >= 0 ? '+' : ''}${e.amount} ${statName(e.stat)})`).join(', ')} ends.`, suit.seat);
    }
  }
}

function statName(stat: Effect['stat']): string {
  return stat === 'shieldingDice' ? 'Shielding dice' : stat === 'armor' ? 'Armor' : 'Movement';
}

function ordinal(n: number): string {
  const sfx = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${sfx}`;
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

function runStage(s: MatchState, ctx: EngineContext): boolean {
  const st = s.stage;
  switch (st.kind) {
    case 'building':
      return stageBuilding(s, ctx);
    case 'rolloff':
      return stageRolloff(s, ctx, st.attempt);
    case 'zone':
      return stageZone(s, ctx, st.chooser);
    case 'placement':
      return stagePlacement(s, ctx, st.next);
    case 'select':
      return stageSelect(s);
    case 'orders':
      return stageOrders(s, ctx);
    case 'resolve':
      return stageResolve(s, ctx, st);
    case 'turnEnd':
      return stageTurnEnd(s);
    case 'roundEnd':
      return stageRoundEnd(s, ctx, st.part);
    case 'finished':
      return false;
  }
}

function stageBuilding(s: MatchState, ctx: EngineContext): boolean {
  if (!s.teams.p1.ready || !s.teams.p2.ready) return false;
  const built: Record<Seat, SuitBuild[]> = { p1: [], p2: [] };
  for (const seat of SEATS) {
    const team = s.teams[seat];
    const r = validateRoster(ctx.catalog, team.roster!, s.settings.pointsBudget);
    if (r.errors.length) {
      team.ready = false;
      team.rosterErrors = r.errors;
      return false;
    }
    built[seat] = r.builds;
  }
  for (const seat of SEATS) {
    built[seat].forEach((b, i) => s.suits.push(newSuit(seat, i, b)));
    s.teams[seat].allowance = built[seat].length;
    s.teams[seat].activationsRemaining = built[seat].length;
  }
  s.status = 'deployment';
  log(s, 'system', '📋 Both teams are ready. Revealing complete builds:');
  for (const seat of SEATS) {
    const team = s.teams[seat];
    log(s, 'system', `${team.name} — ${team.rosterPoints} points, ${team.allowance} activation${team.allowance === 1 ? '' : 's'} per round:`, seat);
    for (const b of built[seat]) {
      log(
        s,
        'info',
        `• ${b.label}: ${b.chassisName} ${b.grade} ${b.version} (scale ${b.scale}) with ${b.equipment.map((e) => e.name).join(', ') || 'no equipment'} — ${b.points} pts.`,
        seat,
      );
    }
  }
  if (s.settings.scaleNote.trim()) log(s, 'system', `Representation scale agreement: ${s.settings.scaleNote.trim()}`);
  goto(s, { kind: 'rolloff', attempt: 1 });
  return true;
}

function stageRolloff(s: MatchState, ctx: EngineContext, attempt: number): boolean {
  const title = 'Deployment roll-off: roll 1d6 (highest chooses the deployment zone)';
  const a = rollDice(s, ctx, `rolloff${attempt}:p1`, 'p1', 1, title);
  const b = rollDice(s, ctx, `rolloff${attempt}:p2`, 'p2', 1, title);
  if (!a || !b) return false;
  s.rolloff = { p1: a[0], p2: b[0] };
  log(s, 'roll', `🎲 Deployment roll-off: ${teamName(s, 'p1')} rolled ${a[0]}, ${teamName(s, 'p2')} rolled ${b[0]}.`);
  if (a[0] === b[0]) {
    log(s, 'roll', 'Tie — both players reroll.');
    goto(s, { kind: 'rolloff', attempt: attempt + 1 });
    return true;
  }
  goto(s, { kind: 'zone', chooser: a[0] > b[0] ? 'p1' : 'p2' });
  return true;
}

function stageZone(s: MatchState, ctx: EngineContext, chooser: Seat): boolean {
  const z = ask<string>(s, 'zone', () => ({
    seat: chooser,
    kind: 'choice',
    title: 'You won the roll-off: choose your deployment zone',
    detail: `Deployment zones extend ${ctx.catalog.rules.deploymentZoneDepth}" from opposite battlefield edges. Your opponent takes the First Selection token and places first.`,
    options: [
      { value: 'North', label: 'North edge' },
      { value: 'South', label: 'South edge' },
    ],
  }));
  if (z === undefined) return false;
  const other = otherSeat(chooser);
  s.teams[chooser].zone = z;
  s.teams[other].zone = z === 'North' ? 'South' : 'North';
  s.tokenHolder = other;
  log(
    s,
    'system',
    `${teamName(s, chooser)} deploys on the ${z} edge; ${teamName(s, other)} on the ${s.teams[other].zone} edge. ${teamName(s, other)} takes the First Selection token and places the first Gunpla.`,
  );
  goto(s, { kind: 'placement', next: other });
  return true;
}

function stagePlacement(s: MatchState, ctx: EngineContext, first: Seat): boolean {
  const undeployed = (seat: Seat) => suitsOf(s, seat).filter((x) => !x.deployed);
  let next = first;
  if (!undeployed(next).length) next = otherSeat(next);
  if (!undeployed(next).length) {
    startGame(s);
    return true;
  }
  const count = s.suits.filter((x) => x.deployed).length;
  const id = ask<string>(s, `place${count}`, () => ({
    seat: next,
    kind: 'choice',
    title: 'Deployment: place one Gunpla entirely within your deployment zone',
    detail: 'Choose which Gunpla you are placing, put it on the table, then confirm. Players alternate one suit at a time.',
    options: undeployed(next).map((x) => ({
      value: x.id,
      label: x.band !== 'grounded' ? `${x.label} (starts at ${bandInfo(ctx.catalog, x.band).label})` : x.label,
    })),
  }));
  if (id === undefined) return false;
  const suit = getSuit(s, id)!;
  suit.deployed = true;
  log(s, 'info', `📍 ${teamName(s, next)} places ${suit.label}.`, next);
  goto(s, { kind: 'placement', next: otherSeat(next) });
  return true;
}

function startGame(s: MatchState): void {
  s.status = 'playing';
  s.round = 1;
  log(s, 'system', `⚔️ Round 1 begins. ${teamName(s, s.tokenHolder!)} holds the First Selection token.`);
  newTurn(s, 1, 1);
}

function stageSelect(s: MatchState): boolean {
  const t = s.turn!;
  for (const seat of [t.firstSeat, otherSeat(t.firstSeat)]) {
    if (t.selections[seat] !== undefined) continue;
    if (!canAct(s, seat)) {
      t.selections[seat] = { kind: 'none' };
      log(s, 'info', `${teamName(s, seat)} has no activations left this round and sits this turn out.`, seat);
      return true;
    }
    return false; // waiting for this seat to select or pass
  }
  goto(s, { kind: 'orders' });
  return true;
}

function stageOrders(s: MatchState, ctx: EngineContext): boolean {
  const t = s.turn!;
  const needed = SEATS.filter((seat) => t.selections[seat]?.kind === 'suit');
  if (needed.some((seat) => !t.locked[seat])) return false;

  // Reveal simultaneously and commit activations.
  const parts: string[] = [];
  for (const seat of [t.firstSeat, otherSeat(t.firstSeat)]) {
    const sel = t.selections[seat]!;
    const team = s.teams[seat];
    if (sel.kind === 'suit') {
      const suit = getSuit(s, sel.suitId)!;
      const order = findOrder(suit, t.locked[seat]!)!;
      team.activationsRemaining = Math.max(0, team.activationsRemaining - 1);
      suit.activations += 1;
      suit.stats.ordersUsed[order.name] = (suit.stats.ordersUsed[order.name] ?? 0) + 1;
      t.queue.push({
        seat,
        suitId: suit.id,
        orderKey: order.key,
        orderName: order.name,
        phase: order.phase,
        weight: order.weight,
        status: 'pending',
      });
      parts.push(`${teamName(s, seat)}: ${suit.label} → ${order.name} [${order.source}] (phase ${order.phase}, weight ${order.weight})`);
    } else if (sel.kind === 'pass') {
      team.activationsRemaining = Math.max(0, team.activationsRemaining - 1);
      parts.push(`${teamName(s, seat)}: pass`);
    }
  }
  if (parts.length) log(s, 'order', `📣 Orders revealed — ${parts.join('  |  ')}`);

  if (t.queue.length === 2) {
    const [a, b] = t.queue;
    if (a.phase === b.phase) {
      const total = a.weight + b.weight;
      const r = randomInt(s, ctx, 'weighted', 1, total);
      s.weightedRolls += 1;
      if (r > a.weight) t.queue.reverse();
      const pct = Math.round((a.weight / total) * 100);
      log(
        s,
        'roll',
        `⚖️ Both orders are phase ${a.phase}. Weighted roll ${r} of ${total}: ${a.orderName} wins on 1–${a.weight} (${pct}%), ${b.orderName} on ${a.weight + 1}–${total} (${100 - pct}%) → ${t.queue[0].orderName} resolves first.`,
      );
    } else {
      t.queue.sort((x, y) => x.phase - y.phase);
    }
  }
  goto(s, t.queue.length ? { kind: 'resolve', item: 0, step: 0, part: 'begin' } : { kind: 'turnEnd' });
  return true;
}

function stageResolve(s: MatchState, ctx: EngineContext, st: Extract<Stage, { kind: 'resolve' }>): boolean {
  const t = s.turn!;
  const item = t.queue[st.item];
  if (!item) {
    goto(s, { kind: 'turnEnd' });
    return true;
  }
  const suit = getSuit(s, item.suitId)!;
  const order = findOrder(suit, item.orderKey)!;
  const next = () => goto(s, { kind: 'resolve', item: st.item + 1, step: 0, part: 'begin' });
  const cancel = (reason: string) => {
    item.status = 'canceled';
    item.note = reason;
    suit.stats.ordersCanceled += 1;
    log(s, 'order', `✖ ${suit.label}'s ${order.name} is canceled — ${reason}. The activation stays spent; no activation heat.`, suit.seat);
    next();
    return true;
  };

  switch (st.part) {
    case 'begin': {
      if (st.item > 0 && t.queue[st.item - 1].phase !== item.phase) expireEffects(s, (e) => e.kind === 'phase');
      if (suit.status !== 'operational') return cancel('the suit was defeated before it could act');
      if (suit.disabled.includes(order.key)) return cancel('the order was disabled by heat');
      if (order.usesPerRound !== undefined) suit.uses[order.key] = (suit.uses[order.key] ?? 0) + 1;
      log(s, 'order', `▶ Phase ${order.phase}: ${suit.label} (${teamName(s, suit.seat)}) executes ${order.name}.`, suit.seat);
      goto(s, { ...st, part: 'step', step: 0 });
      return true;
    }
    case 'step': {
      if (st.step >= order.steps.length || suit.status !== 'operational') {
        goto(s, { ...st, part: 'heat' });
        return true;
      }
      if (!runStep(s, ctx, suit, order, st.step)) return false;
      goto(s, { ...st, step: st.step + 1 });
      return true;
    }
    case 'heat': {
      if (suit.status === 'operational') {
        const before = suit.heat;
        const after = activationHeat(before, suit.activations);
        if (after !== before) {
          setHeat(suit, after);
          log(s, 'heat', `🌡 ${suit.label}: ${ordinal(suit.activations)} activation this round — heat ${before} → ${after}.`, suit.seat);
        } else if (before > 0) {
          log(s, 'heat', `🌡 ${suit.label}: first activation this round — heat stays at ${before}.`, suit.seat);
        }
      }
      goto(s, { ...st, part: 'check' });
      return true;
    }
    case 'check': {
      if (suit.status === 'operational' && suit.heat > 0) {
        if (suit.coolingExempt) {
          log(s, 'heat', `${suit.label} is exempt from heat checks this round (cooled).`, suit.seat);
        } else {
          const roll = rollDice(s, ctx, 'heatcheck', suit.seat, 1, `${suit.label}: heat check at heat ${suit.heat} — roll 1d6`);
          if (!roll) return false;
          applyHeatCheck(s, ctx, suit, roll[0], 'heatcheck');
          processDefeats(s, ctx);
        }
      }
      if (item.status === 'pending') item.status = 'done';
      if (checkVictory(s)) return true;
      next();
      return true;
    }
  }
}

function runStep(s: MatchState, ctx: EngineContext, suit: SuitState, order: BuiltOrder, idx: number): boolean {
  const step = order.steps[idx];
  const tag = `s${idx}`;
  switch (step.type) {
    case 'move':
      return resolveMoveStep(s, ctx, suit, order, tag, step.allowance, currentMovement(suit));
    case 'rangedAttack':
    case 'meleeAttack':
      return resolveAttackStep(s, ctx, suit, order, tag, step);
    case 'modifier': {
      const t = s.turn!;
      const expires: EffectExpiry =
        step.duration === 'phase'
          ? { kind: 'phase' }
          : step.duration === 'round'
            ? { kind: 'round', round: s.round }
            : { kind: 'turn', turn: t.number + step.duration.turns - 1 };
      suit.effects.push({ id: newId(s, 'e'), stat: step.stat, amount: step.amount, source: order.name, expires });
      const until =
        expires.kind === 'phase' ? 'the end of this phase' : expires.kind === 'round' ? 'the end of the round' : step.duration !== 'phase' && step.duration !== 'round' && step.duration.turns > 1 ? `the end of turn ${expires.turn}` : 'the end of the turn';
      const now =
        step.stat === 'armor'
          ? `Armor ${currentArmor(suit)}`
          : step.stat === 'shieldingDice'
            ? `Shielding ${currentShieldingDice(ctx.catalog, suit)}d6`
            : `Movement ${currentMovement(suit)}"`;
      log(s, 'info', `🛡 ${suit.label} gains ${step.amount >= 0 ? '+' : ''}${step.amount} ${statName(step.stat)} until ${until} (now ${now}).`, suit.seat);
      return true;
    }
    case 'cool': {
      const before = suit.heat;
      setHeat(suit, cooledHeat(before, suit.build.cooling));
      const restored = suit.disabled.length;
      suit.disabled = [];
      suit.coolingExempt = true;
      log(
        s,
        'heat',
        `❄️ ${suit.label} cools: heat ${before} → ${suit.heat}${restored ? `, ${restored} heat-disabled entr${restored === 1 ? 'y' : 'ies'} restored` : ''}; exempt from heat checks for the rest of the round.`,
        suit.seat,
      );
      return true;
    }
    case 'enableFlight': {
      if (!suit.build.canFly) log(s, 'info', `${suit.label} has no Flight capability — step skipped.`, suit.seat);
      else if (suit.band !== 'grounded' || suit.flightEnabled) log(s, 'info', `${suit.label} is already airborne — step skipped.`, suit.seat);
      else {
        suit.flightEnabled = true;
        suit.band = 'hover';
        log(s, 'info', `🛫 ${suit.label} enables Flight and rises to Hover.`, suit.seat);
      }
      return true;
    }
  }
}

function stageTurnEnd(s: MatchState): boolean {
  const t = s.turn!;
  expireEffects(s, (e) => e.kind === 'phase' || (e.kind === 'turn' && e.turn <= t.number));
  const roundOver = !canAct(s, 'p1') && !canAct(s, 'p2');
  // The token passes only to an opponent who can activate in the next turn. With uneven
  // team sizes it stays with the player taking solo turns until the other player can
  // activate again (normally the start of the next round, when allowances refresh).
  const holder = t.firstSeat;
  const opp = otherSeat(holder);
  const oppCanActNext = roundOver ? operational(s, opp).length > 0 : canAct(s, opp);
  if (oppCanActNext) {
    s.tokenHolder = opp;
    log(s, 'system', `Turn ${t.roundTurn} of round ${s.round} ends. The First Selection token passes to ${teamName(s, opp)}.`);
  } else {
    s.tokenHolder = holder;
    log(
      s,
      'system',
      `Turn ${t.roundTurn} of round ${s.round} ends. The First Selection token stays with ${teamName(s, holder)} — ${teamName(s, opp)} has no activations left this round.`,
    );
  }
  if (roundOver) {
    goto(s, { kind: 'roundEnd', part: 'heat' });
    return true;
  }
  newTurn(s, t.number + 1, t.roundTurn + 1);
  return true;
}

function stageRoundEnd(s: MatchState, ctx: EngineContext, part: 'heat' | 'objectives' | 'refresh'): boolean {
  const rules = ctx.catalog.rules;
  if (part === 'heat') {
    const needs = s.suits.filter((x) => x.status === 'operational' && x.heat > 0 && x.activations === 0 && !x.coolingExempt);
    const rolls = needs.map((x) =>
      rollDice(s, ctx, `eor:${x.id}`, x.seat, 1, `End of round ${s.round}: heat check for ${x.label} (heat ${x.heat}, no activation this round) — roll 1d6`),
    );
    if (rolls.some((r) => r === undefined)) return false;
    log(s, 'system', `🔚 End of round ${s.round}.`);
    if (!needs.length) log(s, 'heat', 'No end-of-round heat checks are required.');
    needs.forEach((x, i) => applyHeatCheck(s, ctx, x, rolls[i]![0], `eor:${x.id}`));
    processDefeats(s, ctx);
    if (checkVictory(s)) return true;
    goto(s, { kind: 'roundEnd', part: 'objectives' });
    return true;
  }

  if (part === 'objectives') {
    const n = rules.mission.objectives;
    const answers: Partial<Record<Seat, Record<string, number>>> = {};
    let waiting = false;
    for (const seat of SEATS) {
      const eligible = operational(s, seat).filter((x) => x.band === 'grounded');
      if (!eligible.length || n === 0) {
        answers[seat] = {};
        continue;
      }
      const a = ask<Record<string, number>>(s, `obj:${seat}`, () => ({
        seat,
        kind: 'objectives',
        title: `End of round ${s.round}: objective control`,
        detail: `For each of your grounded Gunpla, choose the objective it is within ${rules.mission.controlRadius}" of (center to center), if any. Airborne and defeated suits don't count and aren't listed.`,
        suits: eligible.map((x) => ({ id: x.id, label: x.label })),
        objectives: n,
      }));
      if (a === undefined) waiting = true;
      else answers[seat] = a;
    }
    if (waiting) return false;
    const counts = Array.from({ length: n }, () => ({ p1: 0, p2: 0 }));
    for (const seat of SEATS) {
      for (const obj of Object.values(answers[seat] ?? {})) {
        if (obj >= 1 && obj <= n) counts[obj - 1][seat] += 1;
      }
    }
    const control = counts.map((c) => (c.p1 > c.p2 ? 'p1' : c.p2 > c.p1 ? 'p2' : null)) as (Seat | null)[];
    control.forEach((c) => {
      if (c) s.teams[c].vp += rules.mission.vpPerObjective;
    });
    s.objectiveHistory.push({ round: s.round, control, counts });
    if (n > 0) {
      const desc = counts
        .map((c, i) => {
          const who = control[i];
          if (who) return `#${i + 1} ${teamName(s, who)} (${c.p1}–${c.p2})`;
          return c.p1 + c.p2 > 0 ? `#${i + 1} contested (${c.p1}–${c.p2})` : `#${i + 1} empty`;
        })
        .join(', ');
      log(s, 'system', `🚩 Objectives: ${desc}. Victory points: ${teamName(s, 'p1')} ${s.teams.p1.vp}, ${teamName(s, 'p2')} ${s.teams.p2.vp}.`);
    }
    goto(s, { kind: 'roundEnd', part: 'refresh' });
    return true;
  }

  // refresh
  expireEffects(s, (e) => e.kind === 'round' && e.round <= s.round);
  if (s.round >= s.settings.rounds) {
    decideByVp(s, `after round ${s.round}`);
    return true;
  }
  s.round += 1;
  for (const seat of SEATS) s.teams[seat].activationsRemaining = s.teams[seat].allowance;
  for (const suit of s.suits) {
    suit.activations = 0;
    suit.uses = {};
    suit.coolingExempt = false;
  }
  log(s, 'system', `⚔️ Round ${s.round} begins. ${teamName(s, s.tokenHolder!)} holds the First Selection token.`);
  newTurn(s, s.turn!.number + 1, 1);
  return true;
}
