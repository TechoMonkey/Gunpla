// The host server: serves the browser client and runs every match over Socket.IO.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type { RandomSource } from '../engine/rng';
import { matchReport } from '../engine/report';
import type { Actor, Command, Seat } from '../engine/types';
import { SEATS } from '../engine/types';
import { viewFor, type Viewer } from '../engine/views';
import type { Ack, JoinData, JoinRequest, MatchSummary, MatchUpdate, RosterList, SeatPublic } from '../shared/protocol';
import { loadCatalog } from './catalog';
import { MatchStore, cryptoSource, type LiveMatch } from './store';

export interface ServerOptions {
  dataDir: string;
  savesDir: string;
  clientDir?: string;
  port: number;
  host?: string;
  random?: RandomSource;
  /** Treat every connection as the host machine (tests only). */
  everyoneIsHost?: boolean;
}

interface SocketData {
  matchId: string | null;
  seat: Viewer | null;
  isHost: boolean;
}

const HOST_ONLY: Command['type'][] = ['adjust', 'adjustTeam', 'endMatch'];

function localAddresses(): Set<string> {
  const set = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      set.add(a.address);
      if (a.family === 'IPv4') set.add(`::ffff:${a.address}`);
    }
  }
  return set;
}

export function lanUrls(port: number): string[] {
  const urls: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${port}`);
    }
  }
  return urls;
}

export async function createGameServer(opts: ServerOptions) {
  const store = new MatchStore(opts.savesDir, opts.dataDir, opts.random ?? cryptoSource());
  const warnings = store.loadAll();
  const local = localAddresses();
  const isHostAddr = (addr: string | undefined) => !!opts.everyoneIsHost || (!!addr && local.has(addr));

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 2e6 });

  // ---- HTTP -------------------------------------------------------------
  app.get('/api/whoami', (req, res) => {
    const isHost = isHostAddr(req.socket.remoteAddress);
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : opts.port;
    res.json({ isHost, urls: isHost ? lanUrls(port) : [] });
  });

  const hostOnly: express.RequestHandler = (req, res, next) => {
    if (!isHostAddr(req.socket.remoteAddress)) {
      res.status(403).send('Exports are only available on the host computer.');
      return;
    }
    next();
  };

  app.get('/api/matches/:id/report.txt', hostOnly, (req, res) => {
    const m = store.matches.get(String(req.params.id));
    if (!m) return void res.status(404).send('Match not found');
    res.setHeader('Content-Disposition', `attachment; filename="gunpla-${m.meta.id}-report.txt"`);
    res.type('text/plain; charset=utf-8').send(matchReport(m.state));
  });

  app.get('/api/matches/:id/export.json', hostOnly, (req, res) => {
    const m = store.matches.get(String(req.params.id));
    if (!m) return void res.status(404).send('Match not found');
    const seats = Object.fromEntries(Object.entries(m.meta.seats).map(([k, v]) => [k, { name: v?.name }]));
    res.setHeader('Content-Disposition', `attachment; filename="gunpla-${m.meta.id}.json"`);
    res.json({ meta: { ...m.meta, seats }, commands: m.commands, state: m.state });
  });

  if (opts.clientDir && fs.existsSync(opts.clientDir)) {
    app.use(express.static(opts.clientDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(opts.clientDir!, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.type('text/plain').send('Client not built yet. Run "npm run build" (or "npm start"), or use "npm run dev" for development.');
    });
  }

  // ---- Helpers ------------------------------------------------------------
  const room = (id: string) => `match:${id}`;

  function socketsIn(id: string): Socket[] {
    return [...io.sockets.sockets.values()].filter((s) => (s.data as SocketData).matchId === id);
  }

  function seatsPublic(m: LiveMatch): Partial<Record<Seat, SeatPublic>> {
    const connected = new Set(socketsIn(m.meta.id).map((s) => (s.data as SocketData).seat));
    const out: Partial<Record<Seat, SeatPublic>> = {};
    for (const seat of SEATS) {
      const info = m.meta.seats[seat];
      if (info) out[seat] = { name: info.name, connected: connected.has(seat) };
    }
    return out;
  }

  function summary(m: LiveMatch): MatchSummary {
    return {
      id: m.meta.id,
      name: m.meta.settings.name,
      status: m.state.status,
      round: m.state.round,
      createdAt: m.meta.createdAt,
      diceMode: m.meta.settings.diceMode,
      pointsBudget: m.meta.settings.pointsBudget,
      seats: seatsPublic(m),
      // Team names stay hidden until both teams are revealed at deployment.
      teamNames: m.state.status === 'building' ? { p1: '', p2: '' } : { p1: m.state.teams.p1.name, p2: m.state.teams.p2.name },
      spectators: socketsIn(m.meta.id).filter((s) => (s.data as SocketData).seat === 'spectator').length,
      result: m.state.result,
    };
  }

  function listSummaries(): MatchSummary[] {
    return [...store.matches.values()].map(summary).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function broadcast(id: string): void {
    const m = store.matches.get(id);
    if (!m) return;
    const seats = seatsPublic(m);
    const sockets = socketsIn(id);
    const spectators = sockets.filter((s) => (s.data as SocketData).seat === 'spectator').length;
    const last = m.commands[m.commands.length - 1];
    for (const s of sockets) {
      const d = s.data as SocketData;
      const update: MatchUpdate = {
        view: viewFor(m.state, d.seat ?? 'spectator'),
        seats,
        spectators,
        isHost: d.isHost,
        commandCount: m.commands.length,
        lastCommand: last ? { seq: last.seq, type: last.command.type, actor: last.actor, at: last.at } : undefined,
      };
      s.emit('match:update', update);
    }
    io.to('lobby').emit('lobby:changed');
  }

  // ---- Sockets ------------------------------------------------------------
  io.on('connection', (socket) => {
    const data: SocketData = { matchId: null, seat: null, isHost: isHostAddr(socket.handshake.address) };
    socket.data = data;
    socket.join('lobby');

    const fail = (ack: Ack<any> | undefined, error: string) => ack?.({ ok: false, error });
    const safe =
      <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        try {
          fn(...args);
        } catch (e) {
          console.error('Socket handler error:', e);
          const ack = args[args.length - 1];
          if (typeof ack === 'function') (ack as Ack)({ ok: false, error: (e as Error).message });
        }
      };

    socket.on(
      'lobby:list',
      safe((_: unknown, ack: Ack<{ matches: MatchSummary[]; isHost: boolean; warnings: string[] }>) => {
        ack({ ok: true, matches: listSummaries(), isHost: data.isHost, warnings: data.isHost ? warnings : [] });
      }),
    );

    socket.on(
      'lobby:options',
      safe((_: unknown, ack: Ack<{ battlefields: Record<string, { label: string }>; rounds: number; error?: string }>) => {
        try {
          const cat = loadCatalog(opts.dataDir);
          ack({ ok: true, battlefields: cat.rules.battlefields, rounds: cat.rules.mission.rounds });
        } catch (e) {
          ack({ ok: true, battlefields: {}, rounds: 5, error: (e as Error).message });
        }
      }),
    );

    socket.on(
      'lobby:create',
      safe((settings: unknown, ack: Ack<{ matchId: string }>) => {
        const m = store.create(settings);
        console.log(`Match ${m.meta.id} created: "${m.meta.settings.name}"`);
        ack({ ok: true, matchId: m.meta.id });
        io.to('lobby').emit('lobby:changed');
      }),
    );

    socket.on(
      'match:join',
      safe((req: JoinRequest, ack: Ack<JoinData>) => {
        const m = store.matches.get(req?.matchId);
        if (!m) return fail(ack, 'Match not found');
        let token: string | undefined;
        if (req.seat === 'p1' || req.seat === 'p2') {
          const seatInfo = m.meta.seats[req.seat];
          if (seatInfo) {
            if (!req.token || req.token !== seatInfo.token) {
              return fail(ack, `That seat is already taken by ${seatInfo.name}. (The host can free it from the table view.)`);
            }
            token = seatInfo.token;
            const name = req.name?.trim().slice(0, 30);
            if (name && name !== seatInfo.name) {
              seatInfo.name = name;
              store.saveMeta(m);
            }
          } else {
            const name = req.name?.trim().slice(0, 30);
            if (!name) return fail(ack, 'Enter your name');
            token = crypto.randomUUID();
            m.meta.seats[req.seat] = { name, token };
            store.saveMeta(m);
            console.log(`Match ${m.meta.id}: ${name} took ${req.seat === 'p1' ? 'Player 1' : 'Player 2'}`);
          }
        } else if (req.seat !== 'spectator') {
          return fail(ack, 'Choose a seat');
        }
        if (data.matchId) socket.leave(room(data.matchId));
        data.matchId = m.meta.id;
        data.seat = req.seat;
        socket.join(room(m.meta.id));
        ack({ ok: true, seat: req.seat, token, catalog: m.catalog, isHost: data.isHost });
        broadcast(m.meta.id);
      }),
    );

    socket.on(
      'match:leave',
      safe((_: unknown, ack?: Ack) => {
        const id = data.matchId;
        if (id) socket.leave(room(id));
        data.matchId = null;
        data.seat = null;
        ack?.({ ok: true });
        if (id) broadcast(id);
      }),
    );

    socket.on(
      'match:command',
      safe((command: Command, ack: Ack) => {
        if (!data.matchId) return fail(ack, 'Join a match first');
        if (!command || typeof command !== 'object' || typeof (command as Command).type !== 'string') return fail(ack, 'Bad command');
        let actor: Actor | null = null;
        if (HOST_ONLY.includes(command.type)) actor = data.isHost ? 'host' : null;
        else if (data.seat === 'p1' || data.seat === 'p2') actor = data.seat;
        else if (data.isHost && command.type === 'answer') actor = 'host';
        if (!actor) return fail(ack, HOST_ONLY.includes(command.type) ? 'Only the host computer can do that' : 'Spectators cannot act');
        const r = store.apply(data.matchId, actor, command);
        ack(r);
        if (r.ok) broadcast(data.matchId);
      }),
    );

    socket.on(
      'host:undo',
      safe((_: unknown, ack: Ack<{ undone?: string }>) => {
        if (!data.isHost || !data.matchId) return fail(ack, 'Only the host computer can undo');
        const r = store.undo(data.matchId);
        ack(r);
        if (r.ok) broadcast(data.matchId);
      }),
    );

    socket.on(
      'host:freeSeat',
      safe((req: { seat: Seat }, ack: Ack) => {
        if (!data.isHost || !data.matchId) return fail(ack, 'Only the host computer can free a seat');
        const m = store.matches.get(data.matchId)!;
        if (!m.meta.seats[req.seat]) return fail(ack, 'That seat is already free');
        delete m.meta.seats[req.seat];
        store.saveMeta(m);
        for (const s of socketsIn(m.meta.id)) {
          const d = s.data as SocketData;
          if (d.seat === req.seat) {
            s.emit('match:kicked', 'The host freed your seat. Rejoin to continue.');
            s.leave(room(m.meta.id));
            d.matchId = null;
            d.seat = null;
          }
        }
        ack({ ok: true });
        broadcast(m.meta.id);
      }),
    );

    socket.on(
      'host:delete',
      safe((req: { matchId: string }, ack: Ack) => {
        if (!data.isHost) return fail(ack, 'Only the host computer can delete matches');
        for (const s of socketsIn(req.matchId)) {
          s.emit('match:kicked', 'The host deleted this match.');
          (s.data as SocketData).matchId = null;
          (s.data as SocketData).seat = null;
        }
        if (!store.delete(req.matchId)) return fail(ack, 'Match not found');
        ack({ ok: true });
        io.to('lobby').emit('lobby:changed');
      }),
    );

    socket.on(
      'rosters:list',
      safe((_: unknown, ack: Ack<RosterList>) => ack({ ok: true, ...store.listRosters() })),
    );

    socket.on(
      'rosters:save',
      safe((roster: unknown, ack: Ack) => {
        store.saveRoster(roster);
        ack({ ok: true });
      }),
    );

    socket.on('disconnect', () => {
      if (data.matchId) broadcast(data.matchId);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host ?? '0.0.0.0', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : opts.port;

  return {
    store,
    io,
    server,
    port,
    warnings,
    close: () =>
      new Promise<void>((resolve) => {
        io.close();
        server.close(() => resolve());
      }),
  };
}
