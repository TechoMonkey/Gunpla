import { createContext, useContext } from 'react';
import type { Catalog } from '../engine/schema';
import type { Seat, SuitState } from '../engine/types';
import { otherSeat } from '../engine/types';
import type { MatchView, Viewer } from '../engine/views';
import type { MatchUpdate } from '../shared/protocol';

export interface MatchCtxValue {
  update: MatchUpdate;
  view: MatchView;
  catalog: Catalog;
  me: Viewer;
  isHost: boolean;
}

export const MatchCtx = createContext<MatchCtxValue | null>(null);
export function useMatchCtx(): MatchCtxValue {
  const v = useContext(MatchCtx);
  if (!v) throw new Error('MatchCtx missing');
  return v;
}

export function playerName(u: MatchUpdate, seat: Seat): string {
  return u.seats[seat]?.name ?? (seat === 'p1' ? 'Player 1' : 'Player 2');
}

/** Team name if set, otherwise the player's name. */
export function sideName(u: MatchUpdate, seat: Seat): string {
  return u.view.teams[seat].name || playerName(u, seat);
}

export function bandLabel(catalog: Catalog, band: SuitState['band']): string {
  return catalog.rules.flightBands[band].label;
}

export function opponentOf(me: Viewer): Seat | null {
  return me === 'p1' || me === 'p2' ? otherSeat(me) : null;
}

export function stageText(u: MatchUpdate): string {
  const v = u.view;
  const st = v.stage;
  switch (st.kind) {
    case 'building':
      return 'Team building';
    case 'rolloff':
      return 'Deployment roll-off';
    case 'zone':
      return `${sideName(u, st.chooser)} is choosing a deployment zone`;
    case 'placement':
      return 'Placing Gunpla';
    case 'select':
      return v.nextSelector ? `${sideName(u, v.nextSelector)} is selecting a Gunpla` : 'Selecting';
    case 'orders':
      return 'Choosing orders in secret';
    case 'resolve':
      return 'Resolving orders';
    case 'turnEnd':
      return 'Ending the turn';
    case 'roundEnd':
      return st.part === 'objectives' ? 'End of round — objective control' : 'End of round';
    case 'finished':
      return 'Match finished';
  }
}

export function seatClass(seat: Seat): string {
  return seat === 'p1' ? 'side-p1' : 'side-p2';
}
