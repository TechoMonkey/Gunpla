import type { Seat } from '../../engine/types';
import { navigate, useConnected } from '../net';
import { playerName, seatClass, sideName, stageText, useMatchCtx } from '../lib';

export function Scoreboard() {
  const { update, view, me } = useMatchCtx();
  const connected = useConnected();
  const playing = view.status === 'playing' || view.status === 'finished';

  const side = (seat: Seat) => {
    const team = view.teams[seat];
    const seatInfo = update.seats[seat];
    return (
      <div className={`score-side ${seatClass(seat)} ${me === seat ? 'mine' : ''}`}>
        <div className="score-name">
          {view.tokenHolder === seat && view.status === 'playing' && (
            <span className="token" title="Holds the First Selection token">
              ◆
            </span>
          )}
          {sideName(update, seat)}
          {me === seat && <span className="you">you</span>}
        </div>
        <div className="muted small">
          <span className={`dot ${seatInfo?.connected ? 'on' : 'off'}`} />
          {seatInfo ? playerName(update, seat) : 'Empty seat'}
          {view.status === 'building' && (team.ready ? ' · Ready ✓' : ' · Building…')}
        </div>
        {playing && (
          <div className="score-nums">
            <span title="Victory points">
              <b>{team.vp}</b> VP
            </span>
            <span title="Activations remaining this round">
              <b>{team.activationsRemaining}</b>/{team.allowance} acts
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <header className="scoreboard">
      <div className="score-main">
        <button className="link" onClick={() => navigate('/')}>
          ← Lobby
        </button>
        <div className="match-name">{view.settings.name}</div>
        <div className="muted small">
          {view.status === 'playing' && view.turn ? `Round ${view.round}/${view.settings.rounds} · Turn ${view.turn.roundTurn} · ` : ''}
          {stageText(update)} · {view.settings.diceMode === 'software' ? 'Software dice' : 'Physical dice'}
          {!connected && <span className="warn"> · Reconnecting…</span>}
        </div>
      </div>
      {side('p1')}
      {side('p2')}
    </header>
  );
}
