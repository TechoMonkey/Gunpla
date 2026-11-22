// What each connected browser is allowed to see. The host keeps the full state;
// players only receive a redacted copy.
import { canAct, nextSelector, passEligibility } from './match';
import type { MatchState, Seat } from './types';
import { SEATS } from './types';
import { orderAvailability } from './util';

export type Viewer = Seat | 'spectator';

export interface MatchView extends Omit<MatchState, 'memo'> {
  viewer: Viewer;
  /** suitId -> orderKey -> availability */
  availability: Record<string, Record<string, { ok: boolean; reason?: string }>>;
  nextSelector: Seat | null;
  canPass: Record<Seat, { ok: boolean; reason?: string }>;
  canAct: Record<Seat, boolean>;
}

export const HIDDEN_ORDER = '__hidden__';

export function viewFor(s: MatchState, viewer: Viewer): MatchView {
  const { memo: _memo, ...rest } = s;
  const v = structuredClone(rest) as MatchView;
  v.viewer = viewer;

  // Teams stay secret until both are revealed at deployment.
  if (s.status === 'building') {
    for (const seat of SEATS) {
      if (seat !== viewer) {
        v.teams[seat].roster = null;
        v.teams[seat].rosterErrors = [];
        v.teams[seat].name = '';
        v.teams[seat].rosterPoints = 0;
      }
    }
  }

  // Locked orders stay secret until both players have locked in.
  if (v.turn && s.stage.kind === 'orders') {
    for (const seat of SEATS) {
      if (seat !== viewer && v.turn.locked[seat]) v.turn.locked[seat] = HIDDEN_ORDER;
    }
  }

  v.availability = {};
  for (const suit of s.suits) {
    const m: Record<string, { ok: boolean; reason?: string }> = {};
    for (const o of suit.build.orders) m[o.key] = orderAvailability(suit, o);
    v.availability[suit.id] = m;
  }
  v.nextSelector = s.stage.kind === 'select' ? nextSelector(s) : null;
  v.canPass = { p1: passEligibility(s, 'p1'), p2: passEligibility(s, 'p2') };
  v.canAct = { p1: canAct(s, 'p1'), p2: canAct(s, 'p2') };
  return v;
}
