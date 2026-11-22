// Connection to the host, seat memory, routing and toasts.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Command } from '../engine/types';
import type { Viewer } from '../engine/views';
import type { JoinData, MatchUpdate, Result } from '../shared/protocol';

export const socket: Socket = io();

export async function call<T = object>(event: string, arg?: unknown): Promise<Result<T>> {
  if (!socket.connected) return { ok: false, error: 'Not connected to the host computer' };
  try {
    return await socket.timeout(10000).emitWithAck(event, arg);
  } catch {
    return { ok: false, error: 'The host did not respond — is it still running?' };
  }
}

export async function send(cmd: Command): Promise<boolean> {
  const r = await call('match:command', cmd);
  if (!r.ok) toast(r.error);
  return r.ok;
}

export function useConnected(): boolean {
  const [c, setC] = useState(socket.connected);
  useEffect(() => {
    const on = () => setC(true);
    const off = () => setC(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);
  return c;
}

// ---- Toasts ---------------------------------------------------------------
export interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'info';
}
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((l) => l());
export function toast(text: string, kind: Toast['kind'] = 'error'): void {
  const t = { id: Date.now() + Math.random(), text, kind };
  toasts = [...toasts, t];
  emitToasts();
  setTimeout(() => {
    toasts = toasts.filter((x) => x !== t);
    emitToasts();
  }, 6000);
}
export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
}

// ---- Seat memory (per browser) -------------------------------------------
export interface SeatMemory {
  seat: Viewer;
  token?: string;
  name?: string;
}
const seatKey = (id: string) => `gunpla:seat:${id}`;
function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
export function getSeat(matchId: string): SeatMemory | null {
  try {
    const raw = store()?.getItem(seatKey(matchId));
    return raw ? (JSON.parse(raw) as SeatMemory) : null;
  } catch {
    return null;
  }
}
export function setSeat(matchId: string, mem: SeatMemory | null): void {
  try {
    if (mem) store()?.setItem(seatKey(matchId), JSON.stringify(mem));
    else store()?.removeItem(seatKey(matchId));
  } catch {
    /* storage unavailable */
  }
}
export function getName(): string {
  try {
    return store()?.getItem('gunpla:name') ?? '';
  } catch {
    return '';
  }
}
export function setName(name: string): void {
  try {
    store()?.setItem('gunpla:name', name);
  } catch {
    /* storage unavailable */
  }
}
export function loadLocal<T>(key: string): T | null {
  try {
    const raw = store()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function saveLocal(key: string, value: unknown): void {
  try {
    store()?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

// ---- Routing --------------------------------------------------------------
export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const f = () => setPath(window.location.pathname);
    window.addEventListener('popstate', f);
    return () => window.removeEventListener('popstate', f);
  }, []);
  return path;
}
export function navigate(to: string): void {
  window.history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// ---- Match connection -----------------------------------------------------
export function useMatch(matchId: string, seat: Viewer | null) {
  const [update, setUpdate] = useState<MatchUpdate | null>(null);
  const [joined, setJoined] = useState<JoinData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seat) return;
    let alive = true;
    const doJoin = async () => {
      const mem = getSeat(matchId);
      const r = await call<JoinData>('match:join', {
        matchId,
        seat,
        name: mem?.seat === seat ? mem.name : getName(),
        token: mem?.seat === seat ? mem.token : undefined,
      });
      if (!alive) return;
      if (!r.ok) {
        setError(r.error);
        setJoined(null);
        return;
      }
      setError(null);
      setJoined(r);
      if (seat !== 'spectator') setSeat(matchId, { seat, token: r.token, name: mem?.name ?? getName() });
    };
    const onUpdate = (u: MatchUpdate) => {
      if (u.view.id === matchId) setUpdate(u);
    };
    const onKicked = (msg: string) => {
      setError(msg);
      setJoined(null);
      setUpdate(null);
      if (seat !== 'spectator') setSeat(matchId, null);
    };
    socket.on('match:update', onUpdate);
    socket.on('match:kicked', onKicked);
    socket.on('connect', doJoin);
    if (socket.connected) void doJoin();
    return () => {
      alive = false;
      socket.off('match:update', onUpdate);
      socket.off('match:kicked', onKicked);
      socket.off('connect', doJoin);
      void call('match:leave');
    };
  }, [matchId, seat]);

  return { update, joined, error };
}
