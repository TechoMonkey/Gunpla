import { describe, expect, it } from 'vitest';
import { applyCommand, createMatch } from '../src/engine/match';
import { RecordingRng, ReplayRng, seededSource } from '../src/engine/rng';
import type { Roster } from '../src/engine/schema';
import type { Actor, Command, MatchSettings } from '../src/engine/types';
import { SEATS } from '../src/engine/types';
import { viewFor } from '../src/engine/views';
import { botCommand } from './bot';
import { catalog, gmPair, settings, zakuPair } from './helpers';

interface Recorded {
  actor: Actor;
  command: Command;
  rolls: number[];
}

function playRandomMatch(seed: number, set: MatchSettings, p1: Roster, p2: Roster) {
  const rand = seededSource(seed);
  const s = createMatch('sim', set, '2026-11-21T00:00:00Z');
  const record: Recorded[] = [];
  const send = (actor: Actor, command: Command) => {
    const rng = new RecordingRng(seededSource(seed * 7919 + record.length));
    const r = applyCommand(s, actor, command, { catalog, rng });
    if (!r.ok) throw new Error(`seed ${seed}: ${actor} ${JSON.stringify(command)} rejected: ${r.error}`);
    record.push({ actor, command, rolls: rng.recorded });
  };
  send('p1', { type: 'setRoster', roster: p1 });
  send('p2', { type: 'setRoster', roster: p2 });
  send('p1', { type: 'setReady', ready: true });
  send('p2', { type: 'setReady', ready: true });

  for (let guard = 0; guard < 5000 && s.status !== 'finished'; guard++) {
    let acted = false;
    for (const seat of SEATS) {
      const cmd = botCommand(viewFor(s, seat), seat, rand);
      if (cmd) {
        send(seat, cmd);
        acted = true;
        break;
      }
    }
    if (!acted) throw new Error(`seed ${seed}: stuck at ${JSON.stringify(s.stage)}; prompts ${JSON.stringify(s.prompts)}`);
  }
  return { s, record };
}

describe('random full matches', () => {
  const flyers: Roster = {
    name: 'Flyers',
    suits: [
      { label: 'GM Sky', chassis: 'rgm-79-gm-hg-starter', equipment: ['beam-rifle', 'flight-backpack', 'gm-shield'] },
      { label: 'GM Wall', chassis: 'rgm-79-gm-hg-starter', equipment: ['beam-spray-gun', 'reinforced-plating'] },
    ],
  };
  const trio: Roster = {
    name: 'Trio',
    suits: [
      { label: 'Z1', chassis: 'zaku-ii-hg-starter', equipment: ['machine-gun'] },
      { label: 'Z2', chassis: 'zaku-ii-hg-starter', equipment: ['heat-hawk'] },
      { label: 'Z3', chassis: 'zaku-ii-hg-starter', equipment: ['bazooka'] },
    ],
  };

  it('play to completion without errors (software and physical dice, uneven team sizes, flight)', () => {
    const results: Record<string, number> = { p1: 0, p2: 0, draw: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const mode = seed % 2 ? 'software' : 'physical';
      const [a, b] = seed % 3 === 0 ? [trio, flyers] : seed % 3 === 1 ? [zakuPair, gmPair] : [flyers, zakuPair];
      const { s } = playRandomMatch(seed, settings({ diceMode: mode, pointsBudget: 300 }), a, b);
      expect(s.status).toBe('finished');
      expect(s.round).toBeLessThanOrEqual(5);
      for (const suit of s.suits) {
        expect(suit.hull).toBeGreaterThanOrEqual(0);
        expect(suit.heat).toBeGreaterThanOrEqual(0);
      }
      results[s.result!.winner ?? 'draw'] += 1;
    }
    expect(results.p1 + results.p2 + results.draw).toBe(300);
  });

  it('replaying the command log with recorded dice rebuilds the identical state', () => {
    for (const seed of [11, 12, 13]) {
      const set = settings({ diceMode: 'software' });
      const { s, record } = playRandomMatch(seed, set, zakuPair, gmPair);
      const replay = createMatch('sim', set, '2026-11-21T00:00:00Z');
      for (const r of record) {
        const rng = new ReplayRng(r.rolls, () => {
          throw new Error('replay ran out of recorded rolls');
        });
        const res = applyCommand(replay, r.actor, r.command, { catalog, rng });
        expect(res.ok).toBe(true);
      }
      expect(replay).toEqual(s);
    }
  });
});
