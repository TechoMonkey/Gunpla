import { useEffect, useState } from 'react';
import type { Seat } from '../../engine/types';
import { otherSeat } from '../../engine/types';
import type { MatchSummary } from '../../shared/protocol';
import { ActionPanel } from '../components/ActionPanel';
import { LogFeed } from '../components/LogFeed';
import { Scoreboard } from '../components/Scoreboard';
import { SuitCard } from '../components/SuitCard';
import { MatchCtx, sideName, useMatchCtx } from '../lib';
import { call, getName, getSeat, navigate, setName, setSeat, socket, useMatch } from '../net';
import { TeamBuilder } from './TeamBuilder';

export function MatchPage({ matchId }: { matchId: string }) {
  const mem = getSeat(matchId);
  const [seat, setSeatChoice] = useState<Seat | null>(mem && mem.seat !== 'spectator' ? mem.seat : null);
  const { update, joined, error } = useMatch(matchId, seat);

  if (!seat) {
    return (
      <JoinForm
        matchId={matchId}
        onJoin={(s, name) => {
          setName(name);
          setSeat(matchId, { seat: s, name });
          setSeatChoice(s);
        }}
      />
    );
  }

  if (error) {
    return (
      <div className="page narrow-page">
        <div className="panel">
          <h2>Couldn't join</h2>
          <p>{error}</p>
          <div className="row">
            <button
              className="btn"
              onClick={() => {
                setSeat(matchId, null);
                setSeatChoice(null);
              }}
            >
              Choose another seat
            </button>
            <button className="btn" onClick={() => navigate('/')}>
              Back to lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!update || !joined) return <div className="page loading">Connecting to the host…</div>;

  return (
    <MatchCtx.Provider value={{ update, view: update.view, catalog: joined.catalog, me: seat, isHost: joined.isHost }}>
      <Scoreboard />
      <main className="page">{update.view.status === 'building' ? <TeamBuilder seat={seat} /> : <Board seat={seat} />}</main>
    </MatchCtx.Provider>
  );
}

function Board({ seat }: { seat: Seat }) {
  const { update, view } = useMatchCtx();
  const opp = otherSeat(seat);
  const mine = view.suits.filter((x) => x.seat === seat);
  const theirs = view.suits.filter((x) => x.seat === opp);
  return (
    <div className="board">
      <section className="col side-col">
        <h3 className="col-title side-mine">Your team — {sideName(update, seat)}</h3>
        {mine.map((s) => (
          <SuitCard key={s.id} suit={s} />
        ))}
      </section>
      <section className="col center-col">
        <ActionPanel seat={seat} />
        <div className="panel">
          <h3>Battle log</h3>
          <LogFeed />
        </div>
      </section>
      <section className="col side-col">
        <h3 className="col-title">Opponent — {sideName(update, opp)}</h3>
        {theirs.map((s) => (
          <SuitCard key={s.id} suit={s} />
        ))}
      </section>
    </div>
  );
}

function JoinForm({ matchId, onJoin }: { matchId: string; onJoin: (seat: Seat, name: string) => void }) {
  const [summary, setSummary] = useState<MatchSummary | null | undefined>(undefined);
  const [name, setNameText] = useState(getName());

  useEffect(() => {
    const load = () =>
      void call<{ matches: MatchSummary[] }>('lobby:list').then((r) => {
        if (r.ok) setSummary(r.matches.find((m) => m.id === matchId) ?? null);
      });
    load();
    socket.on('connect', load);
    socket.on('lobby:changed', load);
    return () => {
      socket.off('connect', load);
      socket.off('lobby:changed', load);
    };
  }, [matchId]);

  if (summary === undefined) return <div className="page loading">Connecting to the host…</div>;
  if (summary === null)
    return (
      <div className="page narrow-page">
        <div className="panel">
          <h2>Match not found</h2>
          <button className="btn" onClick={() => navigate('/')}>
            Back to lobby
          </button>
        </div>
      </div>
    );

  return (
    <div className="page narrow-page">
      <div className="panel">
        <button className="link" onClick={() => navigate('/')}>
          ← Lobby
        </button>
        <h2>Join “{summary.name}”</h2>
        <label className="field">
          <span>Your name</span>
          <input className="input" value={name} maxLength={30} autoFocus onChange={(e) => setNameText(e.target.value)} placeholder="e.g. Char" />
        </label>
        <div className="seat-buttons">
          {(['p1', 'p2'] as Seat[]).map((s) => {
            const taken = summary.seats[s];
            return (
              <button key={s} className="btn primary big" disabled={!!taken || !name.trim()} onClick={() => onJoin(s, name.trim())}>
                {s === 'p1' ? 'Player 1' : 'Player 2'}
                <span className="small">{taken ? `Taken by ${taken.name}` : 'Open seat'}</span>
              </button>
            );
          })}
        </div>
        <button className="btn" onClick={() => navigate(`/m/${matchId}/table`)}>
          Watch / table display
        </button>
      </div>
    </div>
  );
}
