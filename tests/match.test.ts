import { describe, expect, it } from 'vitest';
import { ScriptedRng } from '../src/engine/rng';
import type { Catalog, ChassisDef, EquipmentDef, Roster } from '../src/engine/schema';
import { otherSeat, SEATS, type Seat } from '../src/engine/types';
import { currentArmor } from '../src/engine/util';
import { HIDDEN_ORDER, viewFor } from '../src/engine/views';
import { catalog, Game, gmPair, settings, zakuPair } from './helpers';

/** Catalog with the temporary values used by the foundation's §18 worked turn. */
function workedTurnCatalog(): Catalog {
  const base = catalog.chassis['zaku-ii-hg-starter'];
  const blue: ChassisDef = { ...base, id: 'blue', name: 'Blue', stats: { hull: 6, armor: 1, shielding: { dice: 4, target: 5 }, movement: 6, jump: 2 }, points: 10 };
  const red: ChassisDef = { ...base, id: 'red', name: 'Red', points: 10 };
  const rifle: EquipmentDef = {
    id: 'rifle', name: 'Rifle', category: 'weapon', slotCost: 1, points: 0, maxCopies: 1, requires: [], passive: {}, grants: [],
    rangeProfile: [{ max: 24, hit: 4 }],
    orders: [{ id: 'rifle-shot', name: 'Rifle Shot', phase: 2, weight: 10, protected: false, steps: [{ type: 'rangedAttack', dice: 3, damage: 2, sp: 1 }] }],
    counterattacks: [],
  };
  const guard: EquipmentDef = {
    id: 'guard', name: 'Guard Shield', category: 'shield', slotCost: 1, points: 0, maxCopies: 1, requires: [], passive: {}, grants: [],
    orders: [{ id: 'guard', name: 'Guard', phase: 4, weight: 10, protected: false, steps: [{ type: 'modifier', stat: 'armor', amount: 1, duration: 'round' }] }],
    counterattacks: [],
  };
  return { ...catalog, chassis: { ...catalog.chassis, blue, red }, equipment: { ...catalog.equipment, rifle, guard } };
}

describe('§18 worked turn', () => {
  it('reproduces the documented outcome exactly', () => {
    const cat = workedTurnCatalog();
    const g = new Game(cat, settings({ diceMode: 'physical', pointsBudget: 100 }));
    const team = (name: string, chassis: string, eq: string[]) => ({
      name,
      suits: [1, 2, 3].map((i) => ({ label: `${name} ${i}`, chassis, equipment: eq })),
    });
    g.setup(team('Blue', 'blue', ['rifle', 'guard']), team('Red', 'red', ['rifle']));

    // Scenario state: each team has already spent one activation this round; Blue holds the token.
    const s = g.s;
    s.tokenHolder = 'p1';
    s.turn!.firstSeat = 'p1';
    s.teams.p1.activationsRemaining = 2;
    s.teams.p2.activationsRemaining = 2;
    const blue = g.suit('p1-1');
    blue.heat = 2;
    blue.activations = 1;
    g.suit('p2-1').activations = 1; // Red's other suit used Red's earlier activation

    g.cmd('p1', { type: 'select', suitId: 'p1-1' });
    expect(g.tryCmd('p1', { type: 'select', suitId: 'p1-2' }).ok).toBe(false); // already selected
    g.cmd('p2', { type: 'select', suitId: 'p2-2' });
    g.cmd('p2', { type: 'lockOrder', orderKey: 'rifle:rifle-shot' });

    // Red's locked order is hidden from Blue until both lock in.
    expect(viewFor(s, 'p1').turn!.locked.p2).toBe(HIDDEN_ORDER);
    expect(viewFor(s, 'p2').turn!.locked.p2).toBe('rifle:rifle-shot');

    g.cmd('p1', { type: 'lockOrder', orderKey: 'guard:guard' });

    // Phase 2: Red's Rifle Shot resolves first.
    g.answer('p2', 'p1-1', 'choice'); // target Blue
    g.answer('p2', 10, 'number'); // within the Hit 4+ band
    g.answer('p2', 'no', 'choice'); // no cover
    const atk = g.answer('p2', [4, 5, 2], 'dice');
    expect(atk.target).toBe(4);
    const shd = g.answer('p1', [2, 4, 5, 6], 'dice');
    expect(shd.target).toBe(6); // SP 1 raises 5+ to 6+
    expect(blue.hull).toBe(4);
    expect(g.suit('p2-2').heat).toBe(0); // Red's first activation: no heat

    // Phase 4: Guard, then Blue's second-activation heat 2 → 4 and its heat check.
    const hc = g.answer('p1', [2], 'dice');
    expect(hc.title).toMatch(/heat check at heat 4/);
    expect(blue.hull).toBe(3);
    expect(blue.heat).toBe(4);
    expect(currentArmor(blue)).toBe(2);
    expect(blue.disabled).toEqual([]);

    // Turn ends: token passes to Red; one activation left each.
    expect(s.tokenHolder).toBe('p2');
    expect(s.teams.p1.activationsRemaining).toBe(1);
    expect(s.teams.p2.activationsRemaining).toBe(1);
    expect(s.stage.kind).toBe('select');
    expect(s.turn!.firstSeat).toBe('p2');
  });
});

describe('turn flow', () => {
  it('token holder selects first; passing requires every surviving suit to have activated', () => {
    const g = new Game(catalog, settings());
    g.setup(zakuPair, gmPair);
    const first = g.s.turn!.firstSeat;
    const second = first === 'p1' ? 'p2' : 'p1';
    expect(g.tryCmd(second, { type: 'select', suitId: `${second}-1` }).ok).toBe(false);
    const pass = g.tryCmd(first, { type: 'pass' });
    expect(pass.ok).toBe(false);
    if (!pass.ok) expect(pass.error).toMatch(/every surviving Gunpla has activated/);
  });

  it('weighted roll decides matching phases (5 vs 15 → roll 1–5 vs 6–20)', () => {
    // Move (phase 1, weight 15) vs Cool (phase 1, weight 5)
    const rng = new ScriptedRng([]);
    const g = new Game(catalog, settings(), rng);
    g.setup(zakuPair, gmPair);
    g.s.tokenHolder = 'p1';
    g.s.turn!.firstSeat = 'p1';
    g.cmd('p1', { type: 'select', suitId: 'p1-1' });
    g.cmd('p2', { type: 'select', suitId: 'p2-1' });
    g.cmd('p1', { type: 'lockOrder', orderKey: 'chassis:cool' }); // weight 5
    (rng as any).values.push(5); // 5 ≤ 5 → Cool (first seat) resolves first
    g.cmd('p2', { type: 'lockOrder', orderKey: 'chassis:move' }); // weight 15
    expect(g.s.turn!.queue.map((q) => q.orderName)).toEqual(['Cool', 'Move']);
    expect(g.s.log.some((e) => /Weighted roll 5 of 20/.test(e.text))).toBe(true);
  });

  it('§12: cooling on the first activation then 1, 2, 4 heat with no heat checks', () => {
    const g = new Game(catalog, settings({ pointsBudget: 400 }));
    g.setup({ name: 'Solo', suits: [zakuPair.suits[0]] }, { name: 'Four', suits: [...gmPair.suits, { ...gmPair.suits[0], label: 'GM C' }, { ...gmPair.suits[1], label: 'GM D' }] }, [6, 1]);
    const s = g.s;
    s.teams.p1.allowance = s.teams.p1.activationsRemaining = 4; // give the single Zaku four activations
    const zaku = g.suit('p1-1');
    const play = (orderKey: string) => {
      if (g.s.turn!.firstSeat === 'p1') {
        g.cmd('p1', { type: 'select', suitId: 'p1-1' });
        g.cmd('p2', { type: 'pass' as const });
      } else {
        g.cmd('p2', { type: 'pass' as const });
        g.cmd('p1', { type: 'select', suitId: 'p1-1' });
      }
      g.cmd('p1', { type: 'lockOrder', orderKey });
      while (g.s.prompts.length && g.prompt().kind === 'choice') g.answer(g.prompt().seat, g.prompt().options![0].value);
    };
    // GM team must activate each suit before passing — mark them activated for the scenario.
    s.suits.filter((x) => x.seat === 'p2').forEach((x) => (x.activations = 1));
    play('chassis:cool');
    expect(zaku.heat).toBe(0);
    expect(zaku.coolingExempt).toBe(true);
    play('chassis:move');
    expect(zaku.heat).toBe(1);
    play('chassis:move');
    expect(zaku.heat).toBe(2);
    play('shoulder-shield:shoulder-brace');
    expect(zaku.heat).toBe(4);
    expect(zaku.stats.heatChecks).toBe(0);
  });

  it('runs end of round: heat checks for idle heated suits, objective scoring, refresh', () => {
    const g = new Game(catalog, settings());
    g.setup(zakuPair, gmPair);
    const s = g.s;
    const idle = g.suit('p2-2');
    idle.heat = 2;
    // Spend all four activations with Moves on p1-1 and p2-1.
    for (let i = 0; i < 2; i++) {
      for (const seat of [s.turn!.firstSeat, s.turn!.firstSeat === 'p1' ? 'p2' : 'p1'] as const) {
        g.cmd(seat, { type: 'select', suitId: `${seat}-1` });
      }
      g.cmd('p1', { type: 'lockOrder', orderKey: 'chassis:move' });
      g.cmd('p2', { type: 'lockOrder', orderKey: 'chassis:move' });
      // Confirm moves; second-activation heat checks (heat 1) roll a 6.
      for (;;) {
        const p = g.s.prompts[0];
        if (p?.kind === 'choice' && p.options?.[0].value === 'done') g.answer(p.seat, 'done');
        else if (p?.kind === 'dice' && /heat check at/.test(p.title)) g.answer(p.seat, [6]);
        else break;
      }
    }
    // End of round: the idle GM (heat 2, no activation) must roll.
    const eor = g.prompt('p2');
    expect(eor.title).toMatch(/End of round 1: heat check for GM B Marksman/);
    g.answer('p2', [1]); // heat 2: damage on 1–2
    expect(idle.hull).toBe(6);
    // Objectives: p1 holds #1 with both Zakus, p2 contests #2 with one GM.
    g.answer('p1', { 'p1-1': 1, 'p1-2': 1 }, 'objectives');
    g.answer('p2', { 'p2-1': 2, 'p2-2': 0 }, 'objectives');
    expect(s.teams.p1.vp).toBe(1);
    expect(s.teams.p2.vp).toBe(1);
    expect(s.round).toBe(2);
    expect(s.teams.p1.activationsRemaining).toBe(2);
    expect(g.suit('p1-1').activations).toBe(0);
    expect(g.suit('p1-1').heat).toBe(1); // heat carries over
  });

  it('awards the win when a team is completely defeated', () => {
    const g = new Game(catalog, settings());
    g.setup(zakuPair, gmPair);
    g.cmd('host', { type: 'adjust', suitId: 'p2-1', changes: { hull: 0 } });
    expect(g.suit('p2-1').status).toBe('wreck');
    expect(g.s.status).toBe('playing');
    g.cmd('host', { type: 'adjust', suitId: 'p2-2', changes: { hull: 0 } });
    expect(g.s.status).toBe('finished');
    expect(g.s.result).toMatchObject({ winner: 'p1' });
  });

  it('only the player a question is for (or the host) can answer it', () => {
    const g = new Game(catalog, settings());
    g.cmd('p1', { type: 'setRoster', roster: zakuPair });
    g.cmd('p2', { type: 'setRoster', roster: gmPair });
    g.cmd('p1', { type: 'setReady', ready: true });
    g.cmd('p2', { type: 'setReady', ready: true });
    const p = g.prompt('p1');
    expect(g.tryCmd('p2', { type: 'answer', promptId: p.id, value: [3] }).ok).toBe(false);
    expect(g.tryCmd('host', { type: 'answer', promptId: p.id, value: [3] }).ok).toBe(true);
    expect(g.tryCmd('p1', { type: 'answer', promptId: g.prompt('p2').id, value: [9] }).ok).toBe(false);
  });

  it('hides the opponent roster during team building', () => {
    const g = new Game(catalog, settings());
    g.cmd('p1', { type: 'setRoster', roster: zakuPair });
    expect(viewFor(g.s, 'p2').teams.p1.roster).toBeNull();
    expect(viewFor(g.s, 'p1').teams.p1.roster).not.toBeNull();
  });
});

describe('flight (§14)', () => {
  it('enables Flight to Hover, adds altitude to range, and blocks cover at Hover', () => {
    const g = new Game(catalog, settings());
    const flyer = { name: 'Flyers', suits: [{ label: 'GM Flyer', chassis: 'rgm-79-gm-hg-starter', equipment: ['beam-rifle', 'flight-backpack'] }, gmPair.suits[0]] };
    g.setup(flyer, zakuPair);
    const s = g.s;
    s.tokenHolder = 'p1';
    s.turn!.firstSeat = 'p1';
    // Turn 1: Flight toggle vs Move.
    g.cmd('p1', { type: 'select', suitId: 'p1-1' });
    g.cmd('p2', { type: 'select', suitId: 'p2-1' });
    g.cmd('p1', { type: 'lockOrder', orderKey: 'flight-backpack:flight' });
    g.cmd('p2', { type: 'lockOrder', orderKey: 'chassis:cool' });
    const flyerSuit = g.suit('p1-1');
    expect(flyerSuit.band).toBe('hover');
    expect(flyerSuit.flightEnabled).toBe(true);
    expect(viewFor(s, 'p1').availability['p1-1']['flight-backpack:flight']).toMatchObject({ ok: false, reason: 'Already airborne' });

    // Turn 2 (p2 selects first): the hovering GM shoots a grounded Zaku at 22" horizontal + 2" altitude = 24".
    g.cmd('p2', { type: 'select', suitId: 'p2-2' });
    g.cmd('p1', { type: 'select', suitId: 'p1-1' });
    g.cmd('p2', { type: 'lockOrder', orderKey: 'chassis:cool' });
    g.cmd('p1', { type: 'lockOrder', orderKey: 'beam-rifle:beam-rifle-shot' });
    g.answer('p1', 'p2-1', 'choice');
    g.answer('p1', 22, 'number');
    // A grounded target can still claim cover.
    const cover = g.prompt('p1');
    expect(cover.title).toMatch(/in cover/);
    g.answer('p1', 'no');
    const atk = g.prompt('p1');
    expect(atk.kind).toBe('dice');
    expect(atk.target).toBe(3); // 24" falls in the beam rifle's 3+ band
  });
});

describe('designer rulings', () => {
  const trio: Roster = {
    name: 'Zaku Trio',
    suits: [1, 2, 3].map((i) => ({ label: `Zaku ${i}`, chassis: 'zaku-ii-hg-starter', equipment: ['machine-gun'] })),
  };

  /** One turn where every acting seat Moves its chosen suit; seats with no activations sit out automatically. */
  function moveTurn(g: Game, picks: Partial<Record<Seat, string>>) {
    const first = g.s.turn!.firstSeat;
    for (const seat of [first, otherSeat(first)]) {
      if (g.s.turn!.selections[seat]) continue; // already auto-filled as "no activations left"
      g.cmd(seat, { type: 'select', suitId: picks[seat]! });
    }
    for (const seat of SEATS) {
      if (g.s.turn!.selections[seat]?.kind === 'suit') g.cmd(seat, { type: 'lockOrder', orderKey: 'chassis:move' });
    }
    while (g.s.prompts.length && g.prompt().kind === 'choice') g.answer(g.prompt().seat, 'done');
  }

  function unevenGame(startHolder: Seat) {
    const g = new Game(catalog, settings({ diceMode: 'software', pointsBudget: 300 }));
    g.setup(trio, gmPair);
    g.s.tokenHolder = startHolder;
    g.s.turn!.firstSeat = startHolder;
    return g;
  }

  function finishRound(g: Game) {
    // End-of-round objective reports (nobody near an objective).
    while (g.s.prompts.some((p) => p.kind === 'objectives')) g.answer(g.prompt().seat, {}, 'objectives');
  }

  it('uneven teams, case A: token holder runs out normally, solo player keeps it, sat-out player gets it next round', () => {
    const g = unevenGame('p1');
    moveTurn(g, { p1: 'p1-1', p2: 'p2-1' });
    expect(g.s.tokenHolder).toBe('p2');
    moveTurn(g, { p1: 'p1-2', p2: 'p2-2' }); // GM team spends its last activation
    expect(g.s.teams.p2.activationsRemaining).toBe(0);
    expect(g.s.tokenHolder).toBe('p1'); // p1 can still act, so it passes normally
    expect(g.s.turn!.firstSeat).toBe('p1');
    moveTurn(g, { p1: 'p1-3' }); // Zaku solo turn
    finishRound(g);
    expect(g.s.round).toBe(2);
    expect(g.s.tokenHolder).toBe('p2');
    expect(g.s.turn!.firstSeat).toBe('p2');
  });

  it('uneven teams, case B: the token does not pass to a player with no activations left', () => {
    const g = unevenGame('p2');
    moveTurn(g, { p1: 'p1-1', p2: 'p2-1' });
    expect(g.s.tokenHolder).toBe('p1');
    moveTurn(g, { p1: 'p1-2', p2: 'p2-2' }); // GM team spends its last activation
    expect(g.s.tokenHolder).toBe('p1'); // stays with the Zaku player
    expect(g.s.log.some((e) => /token stays with Zaku Trio — GM Starter Pair has no activations left/.test(e.text))).toBe(true);
    expect(g.s.turn!.firstSeat).toBe('p1');
    moveTurn(g, { p1: 'p1-3' }); // Zaku solo turn
    expect(g.s.log.some((e) => /GM Starter Pair has no activations left this round and sits this turn out/.test(e.text))).toBe(true);
    finishRound(g);
    expect(g.s.round).toBe(2);
    expect(g.s.tokenHolder).toBe('p2'); // passes once the GM player can activate again
    expect(g.s.turn!.firstSeat).toBe('p2');
  });

  it('even teams still alternate the token every turn and across rounds', () => {
    const g = new Game(catalog, settings({ diceMode: 'software' }));
    g.setup(zakuPair, gmPair);
    g.s.tokenHolder = 'p1';
    g.s.turn!.firstSeat = 'p1';
    moveTurn(g, { p1: 'p1-1', p2: 'p2-1' });
    expect(g.s.tokenHolder).toBe('p2');
    moveTurn(g, { p1: 'p1-2', p2: 'p2-2' });
    expect(g.s.tokenHolder).toBe('p1');
    finishRound(g);
    expect(g.s.turn!.firstSeat).toBe('p1');
  });

  it.each(['mid', 'high'] as const)('never asks about cover for a %s-altitude target', (band) => {
    const g = new Game(catalog, settings());
    g.setup(zakuPair, gmPair);
    g.s.tokenHolder = 'p1';
    g.s.turn!.firstSeat = 'p1';
    g.cmd('host', { type: 'adjust', suitId: 'p2-1', changes: { band } });
    g.cmd('p1', { type: 'select', suitId: 'p1-1' });
    g.cmd('p2', { type: 'select', suitId: 'p2-2' });
    g.cmd('p1', { type: 'lockOrder', orderKey: 'machine-gun:machine-gun-shot' });
    g.cmd('p2', { type: 'lockOrder', orderKey: 'chassis:cool' }); // phase 1, no prompts
    g.answer('p1', 'p2-1', 'choice');
    g.answer('p1', 6, 'number'); // + altitude keeps it within 18"
    const next = g.prompt('p1');
    expect(next.kind).toBe('dice');
    expect(next.title).toMatch(/attack dice/);
  });
});
