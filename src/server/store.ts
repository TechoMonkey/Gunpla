// Match storage on the host's disk.
//
// saves/matches/<id>/meta.json       settings + seat names/tokens
// saves/matches/<id>/catalog.json    frozen copy of /data from when the match was created
// saves/matches/<id>/commands.jsonl  every accepted command + the random numbers it used
// saves/matches/<id>/snapshot.json   latest full state (fallback if the log can't be replayed)
//
// The command log is the source of truth: replaying it rebuilds the exact state, which
// is also how "undo last step" works.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { applyCommand, createMatch } from '../engine/match';
import { RecordingRng, ReplayRng, type RandomSource } from '../engine/rng';
import { RosterSchema, type Catalog, type Roster } from '../engine/schema';
import type { Actor, Command, CommandResult, MatchSettings, MatchState, Seat } from '../engine/types';
import { loadCatalog } from './catalog';

export interface SeatInfo {
  name: string;
  token: string;
}

export interface MatchMeta {
  id: string;
  createdAt: string;
  settings: MatchSettings;
  seats: Partial<Record<Seat, SeatInfo>>;
}

export interface CommandRecord {
  seq: number;
  at: string;
  actor: Actor;
  command: Command;
  rolls: number[];
}

export interface LiveMatch {
  meta: MatchMeta;
  catalog: Catalog;
  state: MatchState;
  commands: CommandRecord[];
}

export const SettingsInputSchema = z.object({
  name: z.string().trim().min(1, 'Give the match a name').max(60),
  pointsBudget: z.coerce.number().int().min(1).max(100000),
  diceMode: z.enum(['software', 'physical']),
  battlefield: z.string().min(1),
  rounds: z.coerce.number().int().min(1).max(50),
  scaleNote: z.string().max(500).default(''),
});

export function writeFileAtomic(file: string, data: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, file);
}

export function cryptoSource(): RandomSource {
  return (min, max) => crypto.randomInt(min, max + 1);
}

export class MatchStore {
  matches = new Map<string, LiveMatch>();
  private matchesDir: string;
  private rostersDir: string;

  constructor(
    private savesDir: string,
    private dataDir: string,
    private random: RandomSource = cryptoSource(),
  ) {
    this.matchesDir = path.join(savesDir, 'matches');
    this.rostersDir = path.join(savesDir, 'rosters');
    fs.mkdirSync(this.matchesDir, { recursive: true });
    fs.mkdirSync(this.rostersDir, { recursive: true });
  }

  private dir(id: string): string {
    return path.join(this.matchesDir, id);
  }

  /** Loads every saved match from disk. Returns warnings for anything that needed recovery. */
  loadAll(): string[] {
    const warnings: string[] = [];
    for (const id of fs.readdirSync(this.matchesDir)) {
      const dir = this.dir(id);
      if (!fs.statSync(dir).isDirectory()) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')) as MatchMeta;
        const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8')) as Catalog;
        const commands: CommandRecord[] = [];
        const logFile = path.join(dir, 'commands.jsonl');
        if (fs.existsSync(logFile)) {
          const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter((l) => l.trim());
          lines.forEach((line, i) => {
            try {
              commands.push(JSON.parse(line));
            } catch {
              warnings.push(`${id}: skipped unreadable line ${i + 1} of commands.jsonl (probably cut off by a crash)`);
            }
          });
        }
        let state: MatchState;
        try {
          state = this.replay(meta, catalog, commands);
        } catch (e) {
          const snap = path.join(dir, 'snapshot.json');
          if (!fs.existsSync(snap)) throw e;
          warnings.push(`${id}: command log could not be replayed (${(e as Error).message}); restored from snapshot instead`);
          state = JSON.parse(fs.readFileSync(snap, 'utf8'));
        }
        this.matches.set(id, { meta, catalog, state, commands });
      } catch (e) {
        warnings.push(`${id}: could not be loaded — ${(e as Error).message}`);
      }
    }
    return warnings;
  }

  replay(meta: MatchMeta, catalog: Catalog, commands: CommandRecord[]): MatchState {
    const state = createMatch(meta.id, meta.settings, meta.createdAt);
    for (const rec of commands) {
      const rng = new ReplayRng(rec.rolls, this.random);
      const r = applyCommand(state, rec.actor, rec.command, { catalog, rng });
      if (!r.ok) throw new Error(`command #${rec.seq} (${rec.command.type}) was rejected on replay: ${r.error}`);
    }
    return state;
  }

  create(input: unknown): LiveMatch {
    const catalog = loadCatalog(this.dataDir); // fresh read, so edits to /data apply to new matches
    const parsed = SettingsInputSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join('; '));
    const settings: MatchSettings = parsed.data;
    if (!catalog.rules.battlefields[settings.battlefield]) throw new Error(`Unknown battlefield "${settings.battlefield}"`);

    let id: string;
    do {
      id = crypto.randomBytes(3).toString('hex');
    } while (this.matches.has(id) || fs.existsSync(this.dir(id)));
    const meta: MatchMeta = { id, createdAt: new Date().toISOString(), settings, seats: {} };
    const state = createMatch(id, settings, meta.createdAt);
    fs.mkdirSync(this.dir(id), { recursive: true });
    writeFileAtomic(path.join(this.dir(id), 'catalog.json'), JSON.stringify(catalog, null, 2));
    fs.writeFileSync(path.join(this.dir(id), 'commands.jsonl'), '');
    const m: LiveMatch = { meta, catalog, state, commands: [] };
    this.matches.set(id, m);
    this.saveMeta(m);
    this.saveSnapshot(m);
    return m;
  }

  saveMeta(m: LiveMatch): void {
    writeFileAtomic(path.join(this.dir(m.meta.id), 'meta.json'), JSON.stringify(m.meta, null, 2));
  }

  private saveSnapshot(m: LiveMatch): void {
    writeFileAtomic(path.join(this.dir(m.meta.id), 'snapshot.json'), JSON.stringify(m.state));
  }

  /** Validates and applies a command; on success it is appended to the log and the snapshot is saved. */
  apply(id: string, actor: Actor, command: Command): CommandResult {
    const m = this.matches.get(id);
    if (!m) return { ok: false, error: 'Match not found' };
    const draft = structuredClone(m.state);
    const rng = new RecordingRng(this.random);
    let r: CommandResult;
    try {
      r = applyCommand(draft, actor, command, { catalog: m.catalog, rng });
    } catch (e) {
      console.error(`[match ${id}] engine error on ${command.type}:`, e);
      return { ok: false, error: `Internal error: ${(e as Error).message}` };
    }
    if (!r.ok) return r;
    const rec: CommandRecord = { seq: m.commands.length + 1, at: new Date().toISOString(), actor, command, rolls: rng.recorded };
    fs.appendFileSync(path.join(this.dir(id), 'commands.jsonl'), JSON.stringify(rec) + '\n');
    m.commands.push(rec);
    m.state = draft;
    this.saveSnapshot(m);
    return r;
  }

  /** Removes the last command and rebuilds the match from the log. */
  undo(id: string): CommandResult & { undone?: string } {
    const m = this.matches.get(id);
    if (!m) return { ok: false, error: 'Match not found' };
    if (!m.commands.length) return { ok: false, error: 'Nothing to undo' };
    const remaining = m.commands.slice(0, -1);
    let state: MatchState;
    try {
      state = this.replay(m.meta, m.catalog, remaining);
    } catch (e) {
      return { ok: false, error: `Undo failed: ${(e as Error).message}` };
    }
    const undone = m.commands[m.commands.length - 1];
    m.commands = remaining;
    m.state = state;
    writeFileAtomic(path.join(this.dir(id), 'commands.jsonl'), remaining.map((c) => JSON.stringify(c) + '\n').join(''));
    this.saveSnapshot(m);
    return { ok: true, undone: undone.command.type };
  }

  delete(id: string): boolean {
    if (!this.matches.has(id)) return false;
    this.matches.delete(id);
    fs.rmSync(this.dir(id), { recursive: true, force: true });
    return true;
  }

  listRosters(): { starter: Roster[]; saved: Roster[]; error?: string } {
    const saved: Roster[] = [];
    for (const f of fs.readdirSync(this.rostersDir).filter((x) => x.endsWith('.json')).sort()) {
      try {
        const r = RosterSchema.safeParse(JSON.parse(fs.readFileSync(path.join(this.rostersDir, f), 'utf8')));
        if (r.success) saved.push(r.data);
      } catch {
        /* ignore unreadable files */
      }
    }
    try {
      return { starter: loadCatalog(this.dataDir).rosters, saved };
    } catch (e) {
      return { starter: [], saved, error: (e as Error).message };
    }
  }

  saveRoster(input: unknown): Roster {
    const r = RosterSchema.safeParse(input);
    if (!r.success) throw new Error(r.error.issues.map((i) => i.message).join('; '));
    const slug = r.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
    writeFileAtomic(path.join(this.rostersDir, `${slug}.json`), JSON.stringify(r.data, null, 2));
    return r.data;
  }
}
