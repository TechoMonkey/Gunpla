import path from 'node:path';
import { expect } from 'vitest';
import { applyCommand, createMatch } from '../src/engine/match';
import { RecordingRng, seededSource } from '../src/engine/rng';
import type { Catalog, Roster } from '../src/engine/schema';
import type { Actor, Command, EngineContext, MatchSettings, MatchState, Prompt, Rng, Seat } from '../src/engine/types';
import { loadCatalog } from '../src/server/catalog';

export const DATA_DIR = path.resolve(__dirname, '..', 'data');
export const catalog: Catalog = loadCatalog(DATA_DIR);

export const zakuPair = catalog.rosters.find((r) => r.name === 'Zaku Starter Pair')!;
export const gmPair = catalog.rosters.find((r) => r.name === 'GM Starter Pair')!;

export function settings(over: Partial<MatchSettings> = {}): MatchSettings {
  return { name: 'Test', pointsBudget: 200, diceMode: 'physical', battlefield: 'standard', rounds: 5, scaleNote: '', ...over };
}

export class Game {
  s: MatchState;
  ctx: EngineContext;
  constructor(cat: Catalog, set: MatchSettings, rng: Rng = new RecordingRng(seededSource(1))) {
    this.s = createMatch('test', set, '2026-11-21T00:00:00Z');
    this.ctx = { catalog: cat, rng };
  }
  cmd(actor: Actor, c: Command) {
    const r = applyCommand(this.s, actor, c, this.ctx);
    if (!r.ok) throw new Error(`Command ${c.type} by ${actor} failed: ${r.error}`);
    return r;
  }
  tryCmd(actor: Actor, c: Command) {
    return applyCommand(this.s, actor, c, this.ctx);
  }
  prompt(seat?: Seat): Prompt {
    const p = this.s.prompts.find((x) => x.answer === undefined && (!seat || x.seat === seat));
    if (!p) throw new Error(`No open prompt${seat ? ' for ' + seat : ''}. Stage: ${JSON.stringify(this.s.stage)}`);
    return p;
  }
  answer(seat: Seat, value: unknown, expectKind?: Prompt['kind']) {
    const p = this.prompt(seat);
    if (expectKind) expect(p.kind, `prompt "${p.title}"`).toBe(expectKind);
    this.cmd(seat, { type: 'answer', promptId: p.id, value });
    return p;
  }
  suit(id: string) {
    return this.s.suits.find((x) => x.id === id)!;
  }
  /** Rosters in, roll-off, zone and placement done: ends at round 1, turn 1 with p1's... token as rolled. */
  setup(p1: Roster, p2: Roster, rolloff: [number, number] = [6, 1]) {
    this.cmd('p1', { type: 'setRoster', roster: p1 });
    this.cmd('p2', { type: 'setRoster', roster: p2 });
    this.cmd('p1', { type: 'setReady', ready: true });
    this.cmd('p2', { type: 'setReady', ready: true });
    expect(this.s.status).toBe('deployment');
    if (this.s.settings.diceMode === 'physical') {
      this.answer('p1', [rolloff[0]], 'dice');
      this.answer('p2', [rolloff[1]], 'dice');
    }
    const chooser = this.prompt().seat;
    this.answer(chooser, 'North', 'choice');
    while (this.s.status === 'deployment') {
      const p = this.prompt();
      this.answer(p.seat, p.options![0].value, 'choice');
    }
    expect(this.s.status).toBe('playing');
  }
}
