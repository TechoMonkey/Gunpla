import { describe, expect, it } from 'vitest';
import { buildSuit, hitRequirement, validateRoster } from '../src/engine/builder';
import { catalog, gmPair, zakuPair } from './helpers';

describe('data files', () => {
  it('load and validate', () => {
    expect(Object.keys(catalog.chassis)).toEqual(expect.arrayContaining(['zaku-ii-hg-starter', 'rgm-79-gm-hg-starter']));
    expect(Object.keys(catalog.equipment)).toHaveLength(10);
    expect(catalog.rosters).toHaveLength(2);
  });
});

describe('starter builds (HG starter document)', () => {
  const all = [...zakuPair.suits, ...gmPair.suits];

  it.each(all.map((s) => [s.label, s] as const))('%s costs 100 points with 7 normal orders and 1 counterattack', (_label, entry) => {
    const { build, errors } = buildSuit(catalog, entry);
    expect(errors).toEqual([]);
    expect(build!.points).toBe(100);
    expect(build!.orders).toHaveLength(7);
    expect(build!.counterattacks).toHaveLength(1);
    expect(build!.slotsUsed).toEqual({ weapon: 2, shield: 1, upgrade: 0 });
  });

  it('each starter team totals 200 points', () => {
    expect(validateRoster(catalog, zakuPair, 200)).toMatchObject({ totalPoints: 200, errors: [] });
    expect(validateRoster(catalog, gmPair, 200)).toMatchObject({ totalPoints: 200, errors: [] });
  });

  it('labels each granted order with its source item', () => {
    const { build } = buildSuit(catalog, zakuPair.suits[0]);
    const af = build!.orders.find((o) => o.name === 'Advance and Fire')!;
    expect(af.source).toBe('Machine Gun');
    expect(build!.orders.find((o) => o.id === 'move')!.source).toBe('Chassis');
    expect(af.steps[1]).toMatchObject({ type: 'rangedAttack', dice: 4, rangeProfile: catalog.equipment['machine-gun'].rangeProfile });
  });

  it('uses chassis base stats', () => {
    const zaku = buildSuit(catalog, zakuPair.suits[0]).build!;
    expect(zaku.stats).toEqual({ hull: 8, armor: 1, shieldingDice: 3, shieldingTarget: 5, movement: 6, jump: 2 });
    const gm = buildSuit(catalog, gmPair.suits[0]).build!;
    expect(gm.stats).toEqual({ hull: 7, armor: 1, shieldingDice: 4, shieldingTarget: 5, movement: 6, jump: 2 });
  });
});

describe('equipment rules', () => {
  it('refuses the Flight Backpack on the Zaku II (no Flight upgrade support)', () => {
    const { errors } = buildSuit(catalog, { label: 'Z', chassis: 'zaku-ii-hg-starter', equipment: ['flight-backpack'] });
    expect(errors.join()).toMatch(/requires a chassis that supports Flight upgrades/);
  });

  it('allows the Flight Backpack on the GM and grants the protected Flight order', () => {
    const { build, errors } = buildSuit(catalog, { label: 'G', chassis: 'rgm-79-gm-hg-starter', equipment: ['flight-backpack'] });
    expect(errors).toEqual([]);
    expect(build!.canFly).toBe(true);
    expect(build!.points).toBe(80);
    expect(build!.orders.find((o) => o.id === 'flight')).toMatchObject({ protected: true, phase: 1, weight: 10 });
  });

  it('applies Reinforced Plating +1 Armor once', () => {
    const { build } = buildSuit(catalog, { label: 'Z', chassis: 'zaku-ii-hg-starter', equipment: ['reinforced-plating'] });
    expect(build!.stats.armor).toBe(2);
    expect(build!.points).toBe(75);
  });

  it('enforces one copy per named item and slot capacity', () => {
    const dup = buildSuit(catalog, { label: 'Z', chassis: 'zaku-ii-hg-starter', equipment: ['heat-hawk', 'heat-hawk'] });
    expect(dup.errors.join()).toMatch(/only one Heat Hawk/);
    const over = buildSuit(catalog, { label: 'Z', chassis: 'zaku-ii-hg-starter', equipment: ['machine-gun', 'bazooka', 'heat-hawk'] });
    expect(over.errors.join()).toMatch(/3 weapon slot\(s\) but the chassis has 2/);
  });

  it('flags teams over budget and duplicate labels', () => {
    const r = validateRoster(catalog, { name: 'T', suits: [...zakuPair.suits, ...zakuPair.suits] }, 300);
    expect(r.errors.join()).toMatch(/over the 300-point budget/);
    expect(r.errors.join()).toMatch(/unique label/);
  });
});

describe('range bands', () => {
  const mg = catalog.equipment['machine-gun'].rangeProfile!;
  it('picks the hit requirement for the distance', () => {
    expect(hitRequirement(mg, 0)).toBe(5);
    expect(hitRequirement(mg, 4)).toBe(5);
    expect(hitRequirement(mg, 4.5)).toBe(4);
    expect(hitRequirement(mg, 12)).toBe(4);
    expect(hitRequirement(mg, 18)).toBe(5);
    expect(hitRequirement(mg, 18.1)).toBeNull();
  });
  it('§14: flying extends only the outermost band by 3"', () => {
    const profile = [
      { max: 6, hit: 4 },
      { max: 12, hit: 5 },
    ];
    expect(hitRequirement(profile, 15, 3)).toBe(5);
    expect(hitRequirement(profile, 15.5, 3)).toBeNull();
    expect(hitRequirement(profile, 6, 3)).toBe(4);
  });
});
