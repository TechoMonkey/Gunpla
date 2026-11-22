// Schemas for the editable data files in /data. Every file is checked against these
// when the host starts or a match is created, so typos produce readable errors
// instead of strange behaviour mid-game.
import { z } from 'zod';

const int = () => z.number().int();

export const BandSchema = z.enum(['grounded', 'hover', 'mid', 'high']);
export type Band = z.infer<typeof BandSchema>;
export const BANDS: Band[] = ['grounded', 'hover', 'mid', 'high'];

export const RangeBandSchema = z.object({
  max: z.number().positive(),
  hit: int().min(2).max(6),
});
export type RangeBand = z.infer<typeof RangeBandSchema>;

export const DurationSchema = z.union([
  z.literal('phase'),
  z.literal('round'),
  z.object({ turns: int().min(1) }),
]);
export type Duration = z.infer<typeof DurationSchema>;

export const StatKeySchema = z.enum(['armor', 'shieldingDice', 'movement']);
export type StatKey = z.infer<typeof StatKeySchema>;

export const StepSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('move'),
    allowance: z.enum(['full', 'half']),
  }),
  z.object({
    type: z.literal('rangedAttack'),
    dice: int().min(0),
    damage: int().min(0),
    sp: int().min(0).default(0),
    allowsHighAltitudeGroundAttack: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('meleeAttack'),
    dice: int().min(0),
    damage: int().min(0),
    sp: int().min(0).default(0),
    reach: z.number().positive(),
    hit: int().min(2).max(6),
    allowsHighAltitudeGroundAttack: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('modifier'),
    stat: StatKeySchema,
    amount: int(),
    duration: DurationSchema,
  }),
  z.object({ type: z.literal('cool') }),
  z.object({ type: z.literal('enableFlight') }),
]);
export type Step = z.infer<typeof StepSchema>;

export const OrderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phase: int().min(1),
  weight: int().min(1),
  usesPerRound: int().min(1).optional(),
  protected: z.boolean().default(false),
  description: z.string().optional(),
  steps: z.array(StepSchema).min(1),
});
export type OrderDef = z.infer<typeof OrderSchema>;

// Counterattacks are recorded now so builds display them; automatic resolution arrives in v2.
export const CounterattackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  weight: int().min(1),
  dice: int().min(0).optional(),
  hit: int().min(2).max(6).optional(),
  damage: int().min(0).optional(),
  sp: int().min(0).optional(),
  reach: z.number().positive().optional(),
  heatCost: int().min(0).default(0),
  usesPerRound: int().min(1).optional(),
  trigger: z.string(),
  effect: z.string(),
});
export type CounterattackDef = z.infer<typeof CounterattackSchema>;

export const GradeSchema = z.enum(['HG', 'RG', 'MG', 'PG']);
export const GRADE_NAMES: Record<z.infer<typeof GradeSchema>, string> = {
  HG: 'High Grade',
  RG: 'Real Grade',
  MG: 'Master Grade',
  PG: 'Perfect Grade',
};

export const ChassisSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  modelNumber: z.string().optional(),
  grade: GradeSchema,
  version: z.string().min(1),
  referenceScale: z.string().min(1),
  points: int().min(0),
  stats: z.object({
    hull: int().min(1),
    armor: int().min(0),
    shielding: z.object({ dice: int().min(0), target: int().min(2).max(6) }),
    movement: z.number().min(0),
    jump: z.number().min(0),
  }),
  cooling: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('subtract'), amount: int().min(1) }),
    z.object({ kind: z.literal('halve') }),
  ]),
  slots: z.object({ weapon: int().min(0), shield: int().min(0), upgrade: int().min(0) }),
  supportsFlightUpgrades: z.boolean().default(false),
  landingPermitted: z.boolean().default(true),
  startingBand: BandSchema.default('grounded'),
  orders: z.array(z.string()).default(['move', 'cool']),
});
export type ChassisDef = z.infer<typeof ChassisSchema>;

export const CategorySchema = z.enum(['weapon', 'shield', 'upgrade']);
export type Category = z.infer<typeof CategorySchema>;

export const EquipmentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: CategorySchema,
    upgradeType: z.enum(['general', 'specialized']).optional(),
    slotCost: int().min(0).default(1),
    points: int().min(0),
    maxCopies: int().min(1).default(1),
    requires: z.array(z.enum(['supportsFlightUpgrades'])).default([]),
    passive: z
      .object({
        hull: int().optional(),
        armor: int().optional(),
        shieldingDice: int().optional(),
        movement: z.number().optional(),
        jump: z.number().optional(),
      })
      .default({}),
    grants: z.array(z.enum(['flight'])).default([]),
    description: z.string().optional(),
    rangeProfile: z.array(RangeBandSchema).min(1).optional(),
    orders: z.array(OrderSchema).default([]),
    counterattacks: z.array(CounterattackSchema).default([]),
  })
  .superRefine((item, ctx) => {
    const usesRanged = item.orders.some((o) => o.steps.some((s) => s.type === 'rangedAttack'));
    if (usesRanged && !item.rangeProfile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rangeProfile'],
        message: 'is required because this item has a ranged attack order',
      });
    }
    if (item.rangeProfile) {
      for (let i = 1; i < item.rangeProfile.length; i++) {
        if (item.rangeProfile[i].max <= item.rangeProfile[i - 1].max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rangeProfile', i, 'max'],
            message: 'range bands must be listed from shortest to longest',
          });
        }
      }
    }
  });
export type EquipmentDef = z.infer<typeof EquipmentSchema>;

const FlightBandInfoSchema = z.object({
  label: z.string(),
  altitude: z.number().min(0),
  movementBonus: z.number(),
  rangeBonus: z.number(),
  shieldingBonus: int(),
  noCover: z.boolean().default(false),
});
export type FlightBandInfo = z.infer<typeof FlightBandInfoSchema>;

export const RulesSchema = z.object({
  version: z.string().default(''),
  heatCheckTable: z
    .array(
      z.object({
        minHeat: int().min(1),
        maxHeat: int().nullable(),
        damageOn: int().min(0).max(6),
        disableOn: int().min(0).max(6),
      }),
    )
    .min(1),
  heatCheckDamage: int().min(0).default(1),
  flightBands: z.object({
    grounded: FlightBandInfoSchema,
    hover: FlightBandInfoSchema,
    mid: FlightBandInfoSchema,
    high: FlightBandInfoSchema,
  }),
  coverArmorBonus: int().min(0),
  wreck: z.object({ hull: int().min(1), armor: int().min(0), shieldingDice: int().min(0) }),
  crash: z.object({
    hover: z.object({ maxDistance: int().min(0), impact: int().min(0) }),
    mid: z.object({ maxDistance: int().min(0), impact: int().min(0) }),
    high: z.object({ maxDistance: int().min(0), impact: int().min(0) }),
  }),
  terrainProfiles: z
    .array(
      z.object({
        name: z.string(),
        hull: int().nullable(),
        armor: int().nullable(),
        shieldingDice: int().nullable(),
      }),
    )
    .default([]),
  mission: z.object({
    name: z.string(),
    rounds: int().min(1),
    objectives: int().min(0),
    controlRadius: z.number().positive(),
    vpPerObjective: int().min(0).default(1),
  }),
  battlefields: z.record(
    z.string(),
    z.object({ label: z.string(), size: z.string(), deployment: z.string(), objectives: z.string() }),
  ),
  deploymentZoneDepth: z.number().positive(),
});
export type Rules = z.infer<typeof RulesSchema>;

export const RosterSuitSchema = z.object({
  label: z.string().trim().min(1, 'Each Gunpla needs a label'),
  chassis: z.string().min(1),
  equipment: z.array(z.string()).default([]),
  scale: z.string().optional(),
});
export type RosterSuit = z.infer<typeof RosterSuitSchema>;

export const RosterSchema = z.object({
  name: z.string().trim().min(1, 'Team name is required').max(60),
  suits: z.array(RosterSuitSchema).max(20),
});
export type Roster = z.infer<typeof RosterSchema>;

export interface Catalog {
  rules: Rules;
  coreOrders: OrderDef[];
  chassis: Record<string, ChassisDef>;
  equipment: Record<string, EquipmentDef>;
  rosters: Roster[];
}

/** Cross-file checks that a single schema can't do (references between files). */
export function crossCheckCatalog(catalog: Catalog): string[] {
  const errors: string[] = [];
  const coreIds = new Set(catalog.coreOrders.map((o) => o.id));
  for (const c of Object.values(catalog.chassis)) {
    for (const o of c.orders) {
      if (!coreIds.has(o)) errors.push(`chassis "${c.id}": order "${o}" is not defined in data/orders/core.json`);
    }
  }
  for (const r of catalog.rosters) {
    for (const s of r.suits) {
      if (!catalog.chassis[s.chassis]) errors.push(`roster "${r.name}": unknown chassis "${s.chassis}"`);
      for (const e of s.equipment) {
        if (!catalog.equipment[e]) errors.push(`roster "${r.name}": unknown equipment "${e}"`);
      }
    }
  }
  return errors;
}
