import { HostPanel } from '../components/HostPanel';
import { TurnQueue } from '../components/ActionPanel';
import { LogFeed } from '../components/LogFeed';
import { Scoreboard } from '../components/Scoreboard';
import { SuitCard } from '../components/SuitCard';
import { MatchCtx, sideName, stageText, useMatchCtx } from '../lib';
import { navigate, useMatch } from '../net';
import type { Seat } from '../../engine/types';

export function TableView({ matchId }: { matchId: string }) {
  const { update, joined, error } = useMatch(matchId, 'spectator');
  if (error) {
    return (
      <div className="page narrow-page">
        <div className="panel">
          <h2>Couldn't open the table view</h2>
          <p>{error}</p>
          <button className="btn" onClick={() => navigate('/')}>
            Back to lobby
          </button>
        </div>
      </div>
    );
  }
  if (!update || !joined) return <div className="page loading">Connecting to the host…</div>;
  return (
    <MatchCtx.Provider value={{ update, view: update.view, catalog: joined.catalog, me: 'spectator', isHost: joined.isHost }}>
      <Scoreboard />
      <main className="page">
        <TableBody />
        {joined.isHost && <HostPanel />}
      </main>
    </MatchCtx.Provider>
  );
}

function TableBody() {
  const { update, view } = useMatchCtx();
  const side = (seat: Seat) => (
    <section className="col side-col">
      <h3 className={`col-title side-${seat}`}>{sideName(update, seat)}</h3>
      {view.status === 'building' ? (
        <div className="panel muted">{view.teams[seat].ready ? 'Team ready ✓ (hidden until both are ready)' : 'Building a team…'}</div>
      ) : (
        view.suits.filter((x) => x.seat === seat).map((s) => <SuitCard key={s.id} suit={s} />)
      )}
    </section>
  );
  const pending = view.prompts.filter((p) => p.answer === undefined);
  const t = view.turn;
  return (
    <div className="board table-board">
      {side('p1')}
      <section className="col center-col">
        <div className="panel">
          <h3>{stageText(update)}</h3>
          {view.result && (
            <p className="result-line">
              {view.result.winner ? `🏆 ${sideName(update, view.result.winner)} wins` : '🤝 Draw'} — {view.result.reason}.
            </p>
          )}
          {view.stage.kind === 'orders' && t && (
            <div className="muted">
              {(['p1', 'p2'] as Seat[]).map((s) => (
                <div key={s}>
                  {sideName(update, s)}:{' '}
                  {t.selections[s]?.kind === 'suit'
                    ? `${view.suits.find((x) => x.id === (t.selections[s] as { suitId: string }).suitId)?.label} — ${t.locked[s] ? 'locked ✓' : 'choosing…'}`
                    : t.selections[s]?.kind === 'pass'
                      ? 'pass'
                      : 'no activations'}
                </div>
              ))}
            </div>
          )}
          {pending.map((p) => (
            <div key={p.id} className="waiting">
              <div className="spinner" />
              Waiting for {sideName(update, p.seat)}: <em>{p.title}</em>
            </div>
          ))}
          <TurnQueue />
        </div>
        <div className="panel">
          <h3>Battle log</h3>
          <LogFeed />
        </div>
      </section>
      {side('p2')}
    </div>
  );
}
