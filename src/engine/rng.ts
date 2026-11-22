import type { Rng } from './types';

export type RandomSource = (min: number, max: number) => number;

/** Records every random number drawn, so the command log can be replayed exactly. */
export class RecordingRng implements Rng {
  recorded: number[] = [];
  constructor(private source: RandomSource) {}
  int(min: number, max: number): number {
    const v = this.source(min, max);
    this.recorded.push(v);
    return v;
  }
}

/** Replays recorded numbers in order; falls back to the source if the record runs out. */
export class ReplayRng implements Rng {
  private i = 0;
  exhausted = false;
  constructor(
    private values: number[],
    private fallback: RandomSource,
  ) {}
  int(min: number, max: number): number {
    if (this.i < this.values.length) {
      const v = this.values[this.i++];
      if (Number.isInteger(v) && v >= min && v <= max) return v;
    }
    this.exhausted = true;
    return this.fallback(min, max);
  }
}

/** Deterministic seeded generator (mulberry32) — used by tests and simulations. */
export function seededSource(seed: number): RandomSource {
  let a = seed >>> 0;
  return (min, max) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return min + Math.floor(r * (max - min + 1));
  };
}

/** Feeds a fixed list of numbers (for scripted tests); throws when it runs out. */
export class ScriptedRng implements Rng {
  constructor(private values: number[]) {}
  int(min: number, max: number): number {
    if (!this.values.length) throw new Error(`ScriptedRng ran out of values (wanted ${min}-${max})`);
    const v = this.values.shift()!;
    if (v < min || v > max) throw new Error(`ScriptedRng value ${v} outside ${min}-${max}`);
    return v;
  }
}
