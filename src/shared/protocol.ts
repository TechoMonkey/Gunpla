// Messages exchanged between the host server and browsers over Socket.IO.
import type { Catalog, Roster } from '../engine/schema';
import type { Seat } from '../engine/types';
import type { MatchView, Viewer } from '../engine/views';

export interface SeatPublic {
  name: string;
  connected: boolean;
}

export interface MatchSummary {
  id: string;
  name: string;
  status: MatchView['status'];
  round: number;
  createdAt: string;
  diceMode: string;
  pointsBudget: number;
  seats: Partial<Record<Seat, SeatPublic>>;
  teamNames: Record<Seat, string>;
  spectators: number;
  result: MatchView['result'];
}

export interface JoinRequest {
  matchId: string;
  seat: Viewer;
  name?: string;
  token?: string;
}

export interface JoinData {
  seat: Viewer;
  token?: string;
  catalog: Catalog;
  isHost: boolean;
}

export interface MatchUpdate {
  view: MatchView;
  seats: Partial<Record<Seat, SeatPublic>>;
  spectators: number;
  isHost: boolean;
  commandCount: number;
  lastCommand?: { seq: number; type: string; actor: string; at: string };
}

export interface RosterList {
  starter: Roster[];
  saved: Roster[];
  error?: string;
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export type Ack<T = object> = (res: Result<T>) => void;
