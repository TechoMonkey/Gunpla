import { describe, expect, it } from 'vitest';
import { activationHeat, cooledHeat, heatCheckOutcome } from '../src/engine/combat';
import { catalog } from './helpers';

describe('§10 activation heat', () => {
  it('first activation keeps heat; later ones double, 0 becomes 1', () => {
    expect(activationHeat(2, 1)).toBe(2);
    expect(activationHeat(2, 2)).toBe(4);
    expect(activationHeat(4, 3)).toBe(8);
    expect(activationHeat(0, 2)).toBe(1);
    expect(activationHeat(0, 1)).toBe(0);
  });
});

describe('§12 cooling', () => {
  it('subtract and halve (rounding down)', () => {
    expect(cooledHeat(4, { kind: 'subtract', amount: 3 })).toBe(1);
    expect(cooledHeat(2, { kind: 'subtract', amount: 3 })).toBe(0);
    expect(cooledHeat(5, { kind: 'halve' })).toBe(2);
    expect(cooledHeat(1, { kind: 'halve' })).toBe(0);
  });
  it('worked example: 4 heat, Cool 3 on a repeat activation → 1 → 2', () => {
    expect(activationHeat(cooledHeat(4, { kind: 'subtract', amount: 3 }), 2)).toBe(2);
  });
});

describe('§11 heat-check table', () => {
  const o = (heat: number, roll: number) => heatCheckOutcome(catalog, heat, roll);
  it('heat 1: damage on 1 only', () => {
    expect(o(1, 1)).toEqual({ damage: true, disable: false });
    expect(o(1, 2)).toEqual({ damage: false, disable: false });
  });
  it('heat 2–3: damage on 1–2', () => {
    expect(o(3, 2)).toEqual({ damage: true, disable: false });
    expect(o(3, 3)).toEqual({ damage: false, disable: false });
  });
  it('heat 4–7: damage on 1–3, disable on 1', () => {
    expect(o(4, 1)).toEqual({ damage: true, disable: true });
    expect(o(7, 3)).toEqual({ damage: true, disable: false });
    expect(o(7, 4)).toEqual({ damage: false, disable: false });
  });
  it('heat 8–15: damage on 1–4, disable on 1–2', () => {
    expect(o(8, 2)).toEqual({ damage: true, disable: true });
    expect(o(15, 4)).toEqual({ damage: true, disable: false });
  });
  it('heat 16+: damage on 1–5, disable on 1–3', () => {
    expect(o(40, 3)).toEqual({ damage: true, disable: true });
    expect(o(16, 5)).toEqual({ damage: true, disable: false });
    expect(o(16, 6)).toEqual({ damage: false, disable: false });
  });
  it('zero heat is exempt', () => {
    expect(o(0, 1)).toEqual({ damage: false, disable: false });
  });
});
