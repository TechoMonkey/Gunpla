// Plain-text playtest report (foundation §19: record damage, order choices,
// heat-check frequency, canceled orders and objective scores).
import type { MatchState } from './types';
import { SEATS } from './types';
import { teamName } from './util';

export function matchReport(s: MatchState): string {
  const lines: string[] = [];
  const hr = '-'.repeat(72);
  lines.push(`GUNPLA WARS — MATCH REPORT`);
  lines.push(hr);
  lines.push(`Match: ${s.settings.name}  (id ${s.id})`);
  lines.push(`Created: ${s.createdAt}`);
  lines.push(`Points budget: ${s.settings.pointsBudget}   Dice: ${s.settings.diceMode}   Rounds: ${s.settings.rounds}   Battlefield: ${s.settings.battlefield}`);
  if (s.settings.scaleNote) lines.push(`Scale agreement: ${s.settings.scaleNote}`);
  lines.push(`Status: ${s.status}${s.result ? ` — ${s.result.winner ? teamName(s, s.result.winner) + ' wins' : 'draw'} (${s.result.reason})` : ''}`);
  lines.push(`Round reached: ${s.round}   Turns played: ${s.turn?.number ?? 0}   Weighted phase rolls: ${s.weightedRolls}`);
  lines.push('');

  for (const seat of SEATS) {
    const team = s.teams[seat];
    lines.push(hr);
    lines.push(`${teamName(s, seat)} (${seat === 'p1' ? 'Player 1' : 'Player 2'}) — ${team.rosterPoints} pts, ${team.vp} VP, zone ${team.zone ?? '-'}`);
    for (const suit of s.suits.filter((x) => x.seat === seat)) {
      const b = suit.build;
      lines.push(`  ${suit.label}: ${b.chassisName} ${b.grade} ${b.version}, ${b.points} pts [${b.equipment.map((e) => e.name).join(', ')}]`);
      lines.push(`    Final: ${suit.status}, Hull ${suit.hull}/${b.stats.hull}, heat ${suit.heat} (peak ${suit.stats.peakHeat})`);
      const st = suit.stats;
      lines.push(
        `    Attacks ${st.attacksMade}, damage dealt ${st.damageDealt}, damage taken ${st.damageTaken} (heat damage ${st.heatDamage}), heat checks ${st.heatChecks}, orders disabled ${st.ordersDisabled}, orders canceled ${st.ordersCanceled}`,
      );
      const used = Object.entries(st.ordersUsed)
        .map(([k, v]) => `${k} ×${v}`)
        .join(', ');
      lines.push(`    Orders chosen: ${used || 'none'}`);
    }
  }
  lines.push(hr);
  if (s.objectiveHistory.length) {
    lines.push('Objective control by round:');
    for (const h of s.objectiveHistory) {
      const parts = h.control.map((c, i) => `#${i + 1} ${c ? teamName(s, c) : h.counts[i].p1 + h.counts[i].p2 ? 'contested' : 'empty'} (${h.counts[i].p1}–${h.counts[i].p2})`);
      lines.push(`  Round ${h.round}: ${parts.join(', ')}`);
    }
    lines.push(hr);
  }
  lines.push('Full log:');
  let lastRound = -1;
  for (const e of s.log) {
    if (e.round !== lastRound) {
      lines.push(e.round > 0 ? `\n== Round ${e.round} ==` : '\n== Setup ==');
      lastRound = e.round;
    }
    lines.push(`${String(e.n).padStart(4)}  ${e.turn ? `T${e.turn} ` : ''}${e.text}`);
  }
  return lines.join('\n');
}
