// Loads and validates everything in /data. Errors name the file and field.
import fs from 'node:fs';
import path from 'node:path';
import type { z, ZodTypeAny } from 'zod';
import {
  ChassisSchema,
  crossCheckCatalog,
  EquipmentSchema,
  OrderSchema,
  RosterSchema,
  RulesSchema,
  type Catalog,
  type ChassisDef,
  type EquipmentDef,
  type Roster,
} from '../engine/schema';

export class CatalogError extends Error {
  constructor(public problems: string[]) {
    super(`The game data has ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n  - ${problems.join('\n  - ')}`);
  }
}

function readJson(file: string, problems: string[]): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    problems.push(`${file}: ${(e as Error).message}`);
    return undefined;
  }
}

function parse<S extends ZodTypeAny>(schema: S, data: unknown, file: string, problems: string[]): z.output<S> | undefined {
  if (data === undefined) return undefined;
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  for (const issue of r.error.issues) {
    problems.push(`${file}: ${issue.path.length ? issue.path.join('.') + ' ' : ''}${issue.message}`);
  }
  return undefined;
}

function jsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f));
}

export function loadCatalog(dataDir: string): Catalog {
  const problems: string[] = [];
  const rel = (f: string) => path.relative(path.dirname(dataDir), f).replace(/\\/g, '/');

  const rulesFile = path.join(dataDir, 'rules.json');
  const rules = parse(RulesSchema, readJson(rulesFile, problems), rel(rulesFile), problems);

  const coreFile = path.join(dataDir, 'orders', 'core.json');
  const coreOrders = parse(OrderSchema.array(), readJson(coreFile, problems), rel(coreFile), problems) ?? [];

  const chassis: Record<string, ChassisDef> = {};
  for (const f of jsonFiles(path.join(dataDir, 'chassis'))) {
    const c = parse(ChassisSchema, readJson(f, problems), rel(f), problems);
    if (!c) continue;
    if (chassis[c.id]) problems.push(`${rel(f)}: duplicate chassis id "${c.id}"`);
    chassis[c.id] = c;
  }

  const equipment: Record<string, EquipmentDef> = {};
  for (const f of jsonFiles(path.join(dataDir, 'equipment'))) {
    const e = parse(EquipmentSchema, readJson(f, problems), rel(f), problems);
    if (!e) continue;
    if (equipment[e.id]) problems.push(`${rel(f)}: duplicate equipment id "${e.id}"`);
    equipment[e.id] = e;
  }

  const rosters: Roster[] = [];
  for (const f of jsonFiles(path.join(dataDir, 'rosters'))) {
    const r = parse(RosterSchema, readJson(f, problems), rel(f), problems);
    if (r) rosters.push(r);
  }

  if (!Object.keys(chassis).length) problems.push('data/chassis: no chassis files found');
  if (problems.length || !rules) throw new CatalogError(problems);

  const catalog: Catalog = { rules, coreOrders, chassis, equipment, rosters };
  const cross = crossCheckCatalog(catalog);
  if (cross.length) throw new CatalogError(cross);
  return catalog;
}
