// A random-but-legal player used to stress-test the engine and the server.
import type { RandomSource } from '../src/engine/rng';
import type { Command, Prompt, Seat } from '../src/engine/types';
import type { MatchView } from '../src/engine/views';

export function answerFor(p: Prompt, rand: RandomSource): unknown {
  switch (p.kind) {
    case 'dice':
      return Array.from({ length: p.count ?? 1 }, () => rand(1, 6));
    case 'choice': {
      const opts = (p.options ?? []).filter((o) => !o.disabled);
      // Prefer real targets over "none" most of the time.
      const real = opts.filter((o) => o.value !== 'none');
      const pool = real.length && rand(1, 10) > 1 ? real : opts;
      return pool[rand(0, pool.length - 1)].value;
    }
    case 'number':
      return rand(0, 30) + (rand(0, 1) ? 0.5 : 0);
    case 'objectives': {
      const out: Record<string, number> = {};
      for (const suit of p.suits ?? []) out[suit.id] = rand(0, p.objectives ?? 0);
      return out;
    }
  }
}

/** Returns the next command this seat should send, or null if it has nothing to do. */
export function botCommand(v: MatchView, seat: Seat, rand: RandomSource): Command | null {
  if (v.status === 'finished') return null;
  const prompt = v.prompts.find((p) => p.seat === seat && p.answer === undefined);
  if (prompt) return { type: 'answer', promptId: prompt.id, value: answerFor(prompt, rand) };

  if (v.stage.kind === 'select' && v.nextSelector === seat) {
    if (v.canPass[seat].ok && rand(1, 4) === 1) return { type: 'pass' };
    const mine = v.suits.filter((x) => x.seat === seat && x.status === 'operational');
    return { type: 'select', suitId: mine[rand(0, mine.length - 1)].id };
  }

  if (v.stage.kind === 'orders' && v.turn) {
    const sel = v.turn.selections[seat];
    if (sel?.kind === 'suit' && !v.turn.locked[seat]) {
      const avail = Object.entries(v.availability[sel.suitId]).filter(([, a]) => a.ok);
      return { type: 'lockOrder', orderKey: avail[rand(0, avail.length - 1)][0] };
    }
  }
  return null;
}
