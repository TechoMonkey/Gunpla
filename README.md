# Gunpla Wars — Host

Software that runs the bookkeeping for the Gunpla Wars tabletop game. One computer is the **host**: it stores every match, every suit's stats, each player's secretly locked orders, and all dice rolls. Players join from their own phones, tablets, or computers with a web browser on the same Wi-Fi. Nothing gets installed on player devices.

The rules it follows are in [Gunpla Wars/outputs](Gunpla%20Wars/outputs/) (foundation v0.1, HG starter chassis, starter equipment catalog).

## Hosting a game night

1. **One-time setup on the host computer:** install Node.js with `winget install OpenJS.NodeJS.LTS`.
2. **Start the host:** double-click `start-host.bat`. You can also run `npm install` once, then `npm start`.
3. The window prints addresses such as `http://192.168.1.86:3000`. Players open that address in their browser.
4. The first time it runs, Windows Firewall may ask about Node.js. Allow it on **Private networks**.
5. Keep the window open while you play. Closing it (or a crash or reboot) loses nothing: restart and every match resumes where it left off.

## Playing a match

1. **Lobby:** create a match and choose:
   - the points budget (default 200)
   - dice mode:
     - *Software*: the host rolls.
     - *Physical*: players roll real dice and tap in the results.
   - battlefield
   - number of rounds
2. Each player enters a name and joins as **Player 1** or **Player 2**. A browser remembers its seat, so refreshing reconnects to it.
3. **Team builder:** pick chassis and equipment. Points, slots, compatibility, and one-copy limits are checked live. Load a starter team or save your own to the host's team library. Both teams stay hidden until both players submit.
4. **Deployment:** the roll-off, zone choice, and alternating placement are prompted step by step.
5. **Each turn:**
   1. The First Selection token holder selects a suit, then the opponent responds.
   2. Both secretly lock in an order and reveal together.
   3. The software resolves phases and weighted ties.
   4. It asks the right player for targets, measured distances, cover, and dice.
   5. It applies Armor, Shielding, SP, activation heat, and heat checks.
6. **End of round:** idle heated suits make their heat checks, each player reports which objectives their grounded suits are near, victory points are scored, and the round refreshes.
7. **Table view** (`Watch / Table view` in the lobby) is a big-screen overview for a TV. **Open it on the host computer** to get host controls:
   - **Undo last step**
   - **Adjust** any suit's Hull, heat, flight band, disabled orders, uses, and modifiers
   - **Answer for a player** whose device dropped
   - **Free a seat**
   - **End the match early**
   - **Download** the playtest report or full JSON

Measuring stays on the table. Players measure center-to-center horizontal distance, and the software adds altitude differences between flight bands and applies range bands.

## Editing stats between playtests

Every stat lives in plain JSON files in [data/](data/):

| File | Contents |
|---|---|
| [data/rules.json](data/rules.json) | Heat-check table, flight bands, cover, wreck/crash/terrain profiles, mission (rounds, objectives) |
| [data/orders/core.json](data/orders/core.json) | Move and Cool |
| [data/chassis/*.json](data/chassis/) | One file per chassis (Hull, Armor, Shielding, Movement, Jump, cooling, slots, Flight support) |
| [data/equipment/*.json](data/equipment/) | One file per weapon/shield/upgrade: points, slots, range profile, orders, counterattacks, passive modifiers |
| [data/rosters/*.json](data/rosters/) | Starter teams offered in the team builder |

To add a new weapon, copy an existing equipment file, change its `id`, and edit it. Orders are built from steps:

- `move` (`full` or `half`)
- `rangedAttack`
- `meleeAttack`
- `modifier` (`armor`, `shieldingDice` or `movement`, for a `phase`, `round` or `{ "turns": n }`)
- `cool`
- `enableFlight`

Run `npm run check-data` to check your edits. The host also refuses to start with a clear message if a file has a mistake.

Each match keeps a frozen copy of the data from when it was created, so editing stats never breaks a match in progress.

## Where data is stored

Everything is in `saves/` on the host, in readable JSON:

- `saves/matches/<id>/commands.jsonl` records every action and its dice, in order. The match is rebuilt from this log, which is also how Undo works.
- `saves/matches/<id>/snapshot.json` holds the latest state.
- `saves/rosters/` is the team library.

## What v1 automates, and what the host handles by hand

Automated:
- team building and points
- deployment
- the First Selection token
- activations and passing
- secret lock-in
- phases and weighted rolls
- attacks (range bands, flight range bonus, cover, Armor, Shielding, SP)
- activation heat, heat checks, random order disabling, and cooling exemptions
- Flight bands and landing
- timed modifiers
- defeat and wrecks
- crash-scatter rolls
- end-of-round sequence, objective scoring, and victory

By hand with the host Adjust panel (planned for v2):
- **counterattacks** (Heat Hawk Counter, Shield Bash)
- **interception**
- **crash impact damage** to whatever a falling wreck hits
- **attacks on wrecks and destructible terrain**

## Rules decisions (confirmed by the designer)

The rules docs didn't settle these points. The designer has ruled on each:

1. **Uneven team sizes:** when one team runs out of activations first, the other team takes solo turns. The First Selection token does **not** alternate during solo turns: it stays with the player who is still activating, then passes to the other player as soon as they can activate again (normally the start of the next round). With even teams the token alternates every turn, as usual.
2. **No cover for flying targets:** a target at Hover, Mid-altitude or High-altitude never gets cover, and the software doesn't ask. This is set per flight band with `"noCover"` in [data/rules.json](data/rules.json), so it can be changed later without touching code.
3. **Physical-dice mode:** weighted phase-tie rolls, random heat-disable picks, and crash scatter are always rolled by the software.
4. **"N turns" effects** count on a turn counter that continues across rounds.

## For developers

```
npm run dev        # hot-reloading server (port 3000) + client (port 5173)
npm test           # rules engine, builder, 300 random full matches, socket end-to-end test
npm run typecheck
```

- `src/engine/`: pure rules engine (deterministic state machine).
- `src/server/`: Express + Socket.IO host, storage, and replay.
- `src/client/`: React UI.
- The §18 worked turn from the foundation document is reproduced exactly in `tests/match.test.ts`.
