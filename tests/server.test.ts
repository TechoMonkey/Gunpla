import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, describe, expect, it } from 'vitest';
import { seededSource } from '../src/engine/rng';
import type { Command, Seat } from '../src/engine/types';
import { HIDDEN_ORDER } from '../src/engine/views';
import { createGameServer } from '../src/server/app';
import type { JoinData, MatchUpdate, Result } from '../src/shared/protocol';
import { botCommand } from './bot';
import { DATA_DIR, gmPair, zakuPair } from './helpers';

const savesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gunpla-test-'));
afterAll(() => fs.rmSync(savesDir, { recursive: true, force: true }));

class Client {
  socket: Socket;
  update: MatchUpdate | null = null;
  token?: string;
  constructor(url: string) {
    this.socket = connect(url, { transports: ['websocket'], forceNew: true });
    this.socket.on('match:update', (u: MatchUpdate) => (this.update = u));
  }
  async call<T = object>(event: string, arg?: unknown): Promise<Result<T>> {
    return this.socket.timeout(5000).emitWithAck(event, arg);
  }
  async join(matchId: string, seat: Seat | 'spectator', name: string) {
    const r = await this.call<JoinData>('match:join', { matchId, seat, name, token: this.token });
    if (!r.ok) throw new Error(r.error);
    this.token = r.token;
    return r;
  }
  async command(c: Command) {
    const r = await this.call('match:command', c);
    if (!r.ok) throw new Error(`${c.type}: ${r.error}`);
  }
  async waitFor(pred: (u: MatchUpdate) => boolean, ms = 5000) {
    const start = Date.now();
    while (!this.update || !pred(this.update)) {
      if (Date.now() - start > ms) throw new Error('Timed out waiting for update');
      await new Promise((r) => setTimeout(r, 5));
    }
    return this.update;
  }
  close() {
    this.socket.close();
  }
}

async function start() {
  const srv = await createGameServer({ dataDir: DATA_DIR, savesDir, port: 0, host: '127.0.0.1', random: seededSource(99) });
  return { srv, url: `http://127.0.0.1:${srv.port}` };
}

/** Bots take turns until `stop` returns true. */
async function playUntil(clients: Record<Seat, Client>, stop: (u: MatchUpdate) => boolean, seed: number) {
  const rand = seededSource(seed);
  for (let i = 0; i < 4000; i++) {
    const u = clients.p1.update!;
    if (stop(u) || u.view.status === 'finished') return;
    let acted = false;
    for (const seat of ['p1', 'p2'] as Seat[]) {
      const c = clients[seat];
      const cmd = botCommand(c.update!.view, seat, rand);
      if (!cmd) continue;
      const before = c.update!.commandCount;
      await c.command(cmd);
      await clients.p1.waitFor((x) => x.commandCount > before);
      await clients.p2.waitFor((x) => x.commandCount > before);
      acted = true;
      break;
    }
    if (!acted) throw new Error(`Bots stuck at ${JSON.stringify(u.view.stage)}`);
  }
}

describe('host server', () => {
  it('runs a match over sockets, hides secrets, survives a restart, and supports undo', async () => {
    let { srv, url } = await start();
    const p1 = new Client(url);
    const p2 = new Client(url);

    const created = await p1.call<{ matchId: string }>('lobby:create', {
      name: 'Socket test',
      pointsBudget: 200,
      diceMode: 'software',
      battlefield: 'standard',
      rounds: 3,
      scaleNote: '',
    });
    if (!created.ok) throw new Error(created.error);
    const id = created.matchId;

    const j1 = await p1.join(id, 'p1', 'Alice');
    expect(j1.catalog.chassis['zaku-ii-hg-starter']).toBeTruthy();
    await p2.join(id, 'p2', 'Bob');

    // A third browser cannot steal a taken seat.
    const thief = new Client(url);
    await expect(thief.join(id, 'p1', 'Mallory')).rejects.toThrow(/already taken/);
    thief.close();

    await p1.command({ type: 'setRoster', roster: zakuPair });
    await p2.command({ type: 'setRoster', roster: gmPair });
    await p2.waitFor((u) => u.commandCount === 2);
    expect(p2.update!.view.teams.p1.roster).toBeNull(); // secret until reveal
    await p1.command({ type: 'setReady', ready: true });
    await p2.command({ type: 'setReady', ready: true });
    await p1.waitFor((u) => u.view.status === 'deployment');

    // Play into round 2, pausing when someone has locked an order.
    await playUntil({ p1, p2 }, (u) => u.view.round >= 2 && u.view.stage.kind === 'orders' && Object.keys(u.view.turn!.locked).length === 1, 5);
    const locker = (Object.keys(p1.update!.view.turn!.locked)[0] as Seat) ?? 'p1';
    const other: Seat = locker === 'p1' ? 'p2' : 'p1';
    const views = { p1: p1.update!.view, p2: p2.update!.view };
    expect(views[other].turn!.locked[locker]).toBe(HIDDEN_ORDER);
    expect(views[locker].turn!.locked[locker]).not.toBe(HIDDEN_ORDER);

    // Kill the host and start it again from the same save folder.
    const before = srv.store.matches.get(id)!.state;
    const tokens = { p1: p1.token, p2: p2.token };
    p1.close();
    p2.close();
    await srv.close();
    ({ srv, url } = await start());
    expect(srv.store.matches.get(id)!.state).toEqual(before);

    const p1b = new Client(url);
    const p2b = new Client(url);
    p1b.token = tokens.p1;
    p2b.token = tokens.p2;
    await p1b.join(id, 'p1', 'Alice');
    await p2b.join(id, 'p2', 'Bob');
    await p1b.waitFor((u) => u.seats.p2?.connected === true);

    // Undo (host only — localhost is the host) removes exactly the last command.
    const count = p1b.update!.commandCount;
    const undo = await p1b.call<{ undone?: string }>('host:undo');
    expect(undo.ok).toBe(true);
    await p1b.waitFor((u) => u.commandCount === count - 1);
    expect(Object.keys(p1b.update!.view.turn!.locked)).toHaveLength(0);

    // Finish the match.
    await playUntil({ p1: p1b, p2: p2b }, () => false, 6);
    expect(p1b.update!.view.status).toBe('finished');

    // Report export works on the host.
    const res = await fetch(`${url}/api/matches/${id}/report.txt`);
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/GUNPLA WARS — MATCH REPORT/);

    p1b.close();
    p2b.close();
    await srv.close();
  });
});
