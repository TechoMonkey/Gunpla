// Suit assembly: chassis + equipment -> assembled stats, order list (with sources) and points.
import type {
  Band,
  Catalog,
  Category,
  ChassisDef,
  CounterattackDef,
  RangeBand,
  Roster,
  RosterSuit,
  Step,
} from './schema';

export type BuiltStep = Step & { rangeProfile?: RangeBand[] };

export interface BuiltOrder {
  key: string; // unique within the suit
  id: string;
  name: string;
  source: string; // "Chassis" or the item name
  sourceId: string;
  phase: number;
  weight: number;
  usesPerRound?: number;
  protected: boolean;
  description?: string;
  steps: BuiltStep[];
}

export interface BuiltCounter extends CounterattackDef {
  key: string;
  source: string;
  sourceId: string;
}

export interface SuitBuild {
  label: string;
  chassisId: string;
  chassisName: string;
  modelNumber?: string;
  grade: ChassisDef['grade'];
  version: string;
  scale: string;
  chassisPoints: number;
  points: number;
  equipment: { id: string; name: string; category: Category; points: number; slotCost: number }[];
  slotsUsed: Record<Category, number>;
  slotsMax: Record<Category, number>;
  stats: {
    hull: number;
    armor: number;
    shieldingDice: number;
    shieldingTarget: number;
    movement: number;
    jump: number;
  };
  cooling: ChassisDef['cooling'];
  canFly: boolean;
  landingPermitted: boolean;
  startingBand: Band;
  orders: BuiltOrder[];
  counterattacks: BuiltCounter[];
}

export interface BuildResult {
  build: SuitBuild | null;
  errors: string[];
}

export function buildSuit(catalog: Catalog, entry: RosterSuit): BuildResult {
  const errors: string[] = [];
  const label = entry.label?.trim() || 'Unnamed Gunpla';
  const chassis = catalog.chassis[entry.chassis];
  if (!chassis) return { build: null, errors: [`${label}: unknown chassis "${entry.chassis}"`] };

  const slotsUsed: Record<Category, number> = { weapon: 0, shield: 0, upgrade: 0 };
  const slotsMax: Record<Category, number> = { ...chassis.slots };
  const stats = {
    hull: chassis.stats.hull,
    armor: chassis.stats.armor,
    shieldingDice: chassis.stats.shielding.dice,
    shieldingTarget: chassis.stats.shielding.target,
    movement: chassis.stats.movement,
    jump: chassis.stats.jump,
  };
  const orders: BuiltOrder[] = [];
  const counterattacks: BuiltCounter[] = [];
  const equipment: SuitBuild['equipment'] = [];
  let canFly = false;
  let points = chassis.points;

  for (const coreId of chassis.orders) {
    const def = catalog.coreOrders.find((o) => o.id === coreId);
    if (!def) {
      errors.push(`${label}: chassis order "${coreId}" is missing from data/orders/core.json`);
      continue;
    }
    orders.push({
      key: `chassis:${def.id}`,
      id: def.id,
      name: def.name,
      source: 'Chassis',
      sourceId: chassis.id,
      phase: def.phase,
      weight: def.weight,
      usesPerRound: def.usesPerRound,
      protected: def.protected,
      description: def.description,
      steps: def.steps,
    });
  }

  const copies = new Map<string, number>();
  for (const itemId of entry.equipment ?? []) {
    const item = catalog.equipment[itemId];
    if (!item) {
      errors.push(`${label}: unknown equipment "${itemId}"`);
      continue;
    }
    const copyIdx = copies.get(itemId) ?? 0;
    copies.set(itemId, copyIdx + 1);
    if (copyIdx + 1 > item.maxCopies) {
      errors.push(
        item.maxCopies === 1
          ? `${label}: only one ${item.name} may be equipped per Gunpla`
          : `${label}: at most ${item.maxCopies} copies of ${item.name} may be equipped`,
      );
      continue;
    }
    for (const req of item.requires) {
      if (req === 'supportsFlightUpgrades' && !chassis.supportsFlightUpgrades) {
        errors.push(`${label}: ${item.name} requires a chassis that supports Flight upgrades`);
      }
    }
    slotsUsed[item.category] += item.slotCost;
    points += item.points;
    equipment.push({ id: item.id, name: item.name, category: item.category, points: item.points, slotCost: item.slotCost });

    const p = item.passive;
    stats.hull += p.hull ?? 0;
    stats.armor += p.armor ?? 0;
    stats.shieldingDice += p.shieldingDice ?? 0;
    stats.movement += p.movement ?? 0;
    stats.jump += p.jump ?? 0;
    if (item.grants.includes('flight')) canFly = true;

    const suffix = copyIdx > 0 ? `#${copyIdx + 1}` : '';
    for (const def of item.orders) {
      orders.push({
        key: `${item.id}${suffix}:${def.id}`,
        id: def.id,
        name: def.name,
        source: item.name + (copyIdx > 0 ? ` (${copyIdx + 1})` : ''),
        sourceId: item.id,
        phase: def.phase,
        weight: def.weight,
        usesPerRound: def.usesPerRound,
        protected: def.protected,
        description: def.description,
        steps: def.steps.map((s) => (s.type === 'rangedAttack' ? { ...s, rangeProfile: item.rangeProfile } : s)),
      });
    }
    for (const def of item.counterattacks) {
      counterattacks.push({ ...def, key: `${item.id}${suffix}:${def.id}`, source: item.name, sourceId: item.id });
    }
  }

  for (const cat of ['weapon', 'shield', 'upgrade'] as Category[]) {
    if (slotsUsed[cat] > slotsMax[cat]) {
      errors.push(`${label}: uses ${slotsUsed[cat]} ${cat} slot(s) but the chassis has ${slotsMax[cat]}`);
    }
  }
  stats.hull = Math.max(1, stats.hull);
  stats.armor = Math.max(0, stats.armor);
  stats.shieldingDice = Math.max(0, stats.shieldingDice);

  return {
    errors,
    build: {
      label,
      chassisId: chassis.id,
      chassisName: chassis.name,
      modelNumber: chassis.modelNumber,
      grade: chassis.grade,
      version: chassis.version,
      scale: entry.scale?.trim() || chassis.referenceScale,
      chassisPoints: chassis.points,
      points,
      equipment,
      slotsUsed,
      slotsMax,
      stats,
      cooling: chassis.cooling,
      canFly,
      landingPermitted: chassis.landingPermitted,
      startingBand: chassis.startingBand,
      orders,
      counterattacks,
    },
  };
}

export interface RosterResult {
  builds: SuitBuild[];
  totalPoints: number;
  errors: string[];
}

export function validateRoster(catalog: Catalog, roster: Roster, budget: number): RosterResult {
  const errors: string[] = [];
  const builds: SuitBuild[] = [];
  if (!roster.name?.trim()) errors.push('Team name is required');
  if (!roster.suits.length) errors.push('Add at least one Gunpla');
  const labels = new Set<string>();
  for (const suit of roster.suits) {
    const r = buildSuit(catalog, suit);
    errors.push(...r.errors);
    if (r.build) {
      if (labels.has(r.build.label)) errors.push(`Two Gunpla are both labelled "${r.build.label}" — give each a unique label`);
      labels.add(r.build.label);
      builds.push(r.build);
    }
  }
  const totalPoints = builds.reduce((sum, b) => sum + b.points, 0);
  if (totalPoints > budget) errors.push(`Team costs ${totalPoints} points, over the ${budget}-point budget`);
  return { builds, totalPoints, errors };
}

/** Hit requirement for an effective distance, or null if out of range. The flight range bonus extends only the outermost band. */
export function hitRequirement(profile: RangeBand[], distance: number, rangeBonus = 0): number | null {
  for (let i = 0; i < profile.length; i++) {
    const isLast = i === profile.length - 1;
    const max = profile[i].max + (isLast ? rangeBonus : 0);
    if (distance <= max) return profile[i].hit;
  }
  return null;
}

/** Short human-readable summary of an order's steps. */
export function describeSteps(steps: BuiltStep[]): string {
  return steps
    .map((s) => {
      switch (s.type) {
        case 'move':
          return s.allowance === 'full' ? 'Move (full)' : 'Move (half)';
        case 'rangedAttack': {
          const range = s.rangeProfile?.length ? ` · ${describeRange(s.rangeProfile)}` : '';
          return `Shoot ${s.dice}d6, Dmg ${s.damage}, SP ${s.sp}${range}`;
        }
        case 'meleeAttack':
          return `Melee ${s.dice}d6, Hit ${s.hit}+, Dmg ${s.damage}, SP ${s.sp}, reach ${s.reach}"`;
        case 'modifier': {
          const stat = s.stat === 'shieldingDice' ? 'Shielding dice' : s.stat === 'armor' ? 'Armor' : 'Movement';
          const dur =
            s.duration === 'phase'
              ? 'this phase'
              : s.duration === 'round'
                ? 'end of round'
                : s.duration.turns === 1
                  ? 'end of turn'
                  : `${s.duration.turns} turns`;
          return `${s.amount >= 0 ? '+' : ''}${s.amount} ${stat} (${dur})`;
        }
        case 'cool':
          return 'Cool';
        case 'enableFlight':
          return 'Enable Flight → Hover';
      }
    })
    .join(' → ');
}

export function describeRange(profile: RangeBand[]): string {
  let prev = 0;
  return profile
    .map((b) => {
      const s = `${prev === 0 ? '0' : '>' + prev}–${b.max}": ${b.hit}+`;
      prev = b.max;
      return s;
    })
    .join(', ');
}
