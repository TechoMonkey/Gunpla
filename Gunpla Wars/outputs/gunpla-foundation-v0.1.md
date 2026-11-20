# Gunpla tabletop game

Foundation draft v0.1 · Updated November 20, 2026

This draft records the rules developed together so far. The shared numerical values are starting values for playtesting. Unit sheets, points costs, and a complete objective-control playtest will complete the initial tabletop prototype.

## 1. Teams and activations

Both players build teams at or below the same agreed points budget. A complete suit's points cost is its chassis cost plus the costs of all equipped weapons, shields, and upgrades.

Each chassis profile identifies its Gunpla, grade, and version. Gameplay grades progress through High Grade (HG), Real Grade (RG), Master Grade (MG), and Perfect Grade (PG). For the same Gunpla model, higher-grade chassis provide stronger base stats, additional chassis orders, or both. Each chassis has its own points cost reflecting those capabilities.

Players choose each suit's chassis and equipment while building their team. Teams may mix gameplay grades within the agreed points budget.

The chassis supplies Hull, Armor, base Shielding, Movement, Jump capability, cooling strength, and native orders such as Move and Cool. Weapons contribute attack orders and can contribute counterattacks. Shields can contribute stat modifiers, defensive orders, and counterattacks. Upgrades can modify stats or grant passive capabilities and orders, such as a backpack that grants Flight capability and its toggle order.

Apply equipped passive stat modifiers once to the chassis values when assembling the suit. Its available orders combine the chassis's orders and the entries granted by equipped items. Display each order's source item and apply relevant upgrades to its displayed values. Select one available normal order per activation.

The two HG starter chassis each have 2 weapon slots, 1 shield slot, and 3 upgrade slots. General and specialized upgrades share the upgrade-slot capacity. Each component specifies its slot cost and any chassis requirements. A Flight Backpack, for example, uses an upgrade slot and requires a chassis that supports Flight upgrades.

A Gunpla may equip one copy of each named weapon or upgrade by default. An item card can explicitly permit additional copies and specify a maximum. Each equipped copy uses its listed slots and points. This uniqueness limit is per Gunpla; different suits may each equip their own copy of the same item.

Chassis restrictions govern legal equipment, movement states, and actions. An item changes a restriction only when its text explicitly states that change. Landing permission is separate from Flight capability.

The MSN-02 Zeong is a design example of a chassis with landing prohibited because it has no legs. Such a chassis requires a legal airborne starting state and native airborne movement in its eventual profile. It contributes zero to grounded objective control while operational. Defeat resolves a crash and creates a wreck under the ordinary rules.

Gameplay grade and physical representation scale are recorded separately. Each profile has a reference physical scale. HG and RG use 1/144 as their reference scale, while PG uses 1/60. A replacement kit for the same Gunpla model must match the agreed representation scale for its gameplay grade. HG and RG kits at 1/144 can substitute for one another.

Before deployment, players may agree to an alternate representation scale for a gameplay grade. Apply that scale to all units of that grade on both teams. For example, both players may use 1/144 HG kits with PG profiles, following the PG stats, orders, and points costs. Both teams' models using PG profiles then use 1/144 representation.

The first two chassis are Zaku II HG Starter and RGM-79 GM HG Starter. Starter is the version label within High Grade. Their approved base stats, core orders, and example equipped builds are recorded in the HG starter chassis and builds document. The starter equipment catalog contains the component cards and their granted orders.

For the initial game mode, teams may mix factions and series. Multiple copies of the same Gunpla are allowed. A faction-restricted game mode can be developed later.

Each copy independently tracks Hull, heat, orders disabled by heat, activation count, cooling use, counterattack uses, flight state, and timed effects.

A team's activation allowance equals its starting number of Gunpla. The team receives this full allowance every round throughout the game, including after casualties.

Players may distribute activations among surviving suits. The same suit may activate repeatedly in a round.

Once every surviving suit on a team has taken a normal activation that round, that player may pass instead of activating a suit. A pass forfeits one remaining activation. Counterattacks do not count toward unlocking passes.

## 2. Terms and the First Selection token

| Term | Meaning |
|---|---|
| Round | The period in which both teams spend or forfeit their activation allowances. |
| Turn | Both players select a suit or make an eligible pass, commit orders, and resolve them. |
| Phase | A numbered resolution window within a turn. Lower phases resolve first. |
| Activation | One team activation committed to a suit's normal order. A canceled order still counts as an activation. |
| Order | A committed action or sequence of actions, with its effects, phase, weight, and any duration. |
| Weight | The relative chance of resolving first when orders share a phase. |
| Counterattack | A conditional interrupt with its own effects, limits, and any heat cost. |
| Passive capability | A capability such as Jump that modifies the suit's permitted actions. |
| Toggle order | An order that changes a persistent state, such as enabling Flight. |

The player holding the First Selection token publicly selects a Gunpla first. The opponent selects in response. Once both suits are known, both players choose their orders secretly.

Pass the token to the opponent after each turn, including turns involving an eligible pass. This alternation continues across round boundaries.

Phase and weight determine order resolution. The token determines who selects a suit first.

## 3. Deployment

1. Reveal both teams and their complete builds, including each suit's chassis grade, version, equipment, and physical representation scale. Confirm any shared alternate-scale agreement.
2. Both players roll a d6, rerolling ties.
3. The higher roller chooses a deployment zone.
4. The other player takes the First Selection token and places the first Gunpla.
5. Alternate placing one suit at a time, entirely within the deployment zones.
6. Begin turn one with the token holder selecting first.

Deployment zones extend 6 inches from opposite battlefield edges.

Every suit starts with full Hull, zero heat, and all orders available. The default starting state is grounded. A chassis with an airborne deployment requirement uses the starting flight band specified by its profile.

## 4. Turn sequence

1. The token holder publicly selects a suit or declares an eligible pass.
2. The opponent selects in response or declares an eligible pass.
3. Both players secretly choose and lock in an order for their selected suit.
4. Once both are ready, reveal the orders simultaneously.
5. Resolve phases from lowest to highest, using weighted rolls for matching phases.
6. Resolve each order's steps in sequence, including eligible interrupts, then apply its end-of-activation heat gain and any required heat check.
7. Pass the First Selection token.

Players commit to the order. They choose targets, movement paths, and destinations when the relevant steps resolve.

A combined order uses one activation, one phase, and one weight. Resolve its entire sequence before the next normal order begins. For example, Move → Shoot moves before choosing the shot's target. Shoot → Move attacks before moving.

Skip a step that cannot be performed and continue with the remaining steps. An attack step with no legal target is spent. The activation and normal heat handling still apply.

A suit defeated before its pending order resolves loses that order and its committed activation.

## 5. Matching phases

When opposing orders share a phase, each order's chance of resolving first is its weight divided by the sum of their weights.

For weights 5 and 15, the chances are 25% and 75%. A software roll can select one of the 20 weighted outcomes. Resolve the winning order fully, including its required interrupts and heat checks, before the other normal order begins.

## 6. Measurement, movement, and melee

Use a fixed center marker attached to each Gunpla as its measurement reference.

Movement is free movement measured in inches. Choose the path when movement resolves. A suit may use up to its listed distance, and turning along a path counts the full path traveled.

Use center points for movement, weapon range, melee reach, objective distance, and distance-based abilities. Measure cover distance from the center marker to the nearest part of the intervening terrain.

Normal ground movement follows traversable paths around solid obstacles and occupied positions. Melee reach is specified by the weapon or order.

Suits may enter and leave melee reach through ordinary movement. Appropriate counterattack abilities can react to that movement when their conditions are met.

Melee attacks check reach when their attack step resolves. Each weapon's range profile determines its shooting difficulty. Nearby enemies can use qualifying counterattacks to disrupt ranged attacks.

Targeting is 360 degrees. Use torso-to-torso line of sight.

## 7. Attack and defense

Each attack order displays its attack dice, hit requirements by range, damage per hit, and Shield Piercing value after applicable equipment and upgrade modifiers. It also specifies its sequence of actions, phase, and weight. Equipping a weapon adds the orders listed on that weapon's component card.

For an attack written as 3d6, Hit 4+, Damage 2, SP 1, roll three dice. Each result of 4 or higher generates two damage.

Resolve an ordinary attack as follows.

1. Choose a legal target and determine the applicable range band.
2. Resolve any applicable interception and interrupts.
3. Roll the attack dice. Each success generates the listed damage per hit.
4. Add the damage from successful hits.
5. Subtract the defender's Armor once from the attack total, to a minimum of zero.
6. If damage remains, roll the defender's Shielding dice. Each success blocks one additional damage.
7. Apply remaining damage to Hull.

Shield Piercing raises the defender's shielding success requirement by its value, capped at 6+. For example, Shielding 4d6 at 5+ becomes four dice at 6+ against SP 1.

All damage negated by Armor and Shielding results in zero Hull loss.

Each weapon has its own range profile and maximum range. A weapon can be strongest at short, medium, or long range. The earlier illustrative 18-inch maximum applies only to that example profile.

## 8. Defensive orders and duration

A defensive bonus takes effect immediately when its order resolves. Earlier attacks use the suit's defenses at the time those attacks resolve.

If a defensive order and an attack share a phase, the weighted roll can determine whether the defensive bonus is active for that attack.

Every order specifies its duration. These can include the current phase, the current turn, the end of the round, or multiple turns.

For effects measured in turns, count the current turn as the first. A two-turn effect lasts for the remainder of the turn in which it begins and the entire following turn.

## 9. Cover and interception

Cover grants +1 Armor against ranged attacks when the target is within 1 inch of terrain that partially obstructs the shot. Terrain that completely hides the target's torso blocks the shot.

An intervening Gunpla intercepts when its torso obstructs the intended torso-to-torso firing line. Use the height-gauge reference for an airborne interceptor. An operational allied Gunpla within 3 inches of the shooter is exempt from interception. Measure that exception from the original shooter's center marker throughout the attack.

Resolve interceptors from nearest to farthest along the firing line.

1. Roll the attack against the interceptor using the weapon's hit requirement at that distance.
2. Resolve successful hits against the interceptor's defenses.
3. Carry only missed attack dice to the next interceptor and repeat the first two steps.
4. Once all interceptors have been processed, reroll any remaining missed dice against the original target using its applicable range band and defenses.

Only attack dice that miss continue. Dice that hit are spent in resolving the interceptor's defenses.

## 10. Heat gain

Heat is tracked separately for each suit and carries between rounds.

| Activation of that suit this round | Heat after the order's effects | Heat after end-of-activation gain |
|---|---:|---:|
| First | Any value | Same value |
| Second or later | 0 | 1 |
| Second or later | 1 or more | Double the current value |

For example, a suit starting a round at 2 heat remains at 2 on its first activation, rises to 4 on its second, and rises to 8 on its third.

Apply normal activation heat after the order finishes, immediately before its heat check. Calculate this gain from the heat remaining after the order's effects, including cooling. Resolve the order, apply activation heat, then make the required heat check unless the suit has the cooling exemption.

## 11. Heat checks

Make a heat check in these situations, subject to the cooling exemption:

| Situation | Timing |
|---|---|
| A normal activation ends with heat | After resolving the whole order and applying activation heat gain |
| A counterattack ends with heat | After resolving the counterattack |
| A heated suit took no normal activation during the round | At the end of the round |

A suit that took at least one normal activation has already handled its checks through activations and interrupts. A suit that only counterattacked still makes its end-of-round check if it has heat.

At the end of a round, roll all required heat checks before applying their results. Apply the results, resolve resulting crashes and collapses, then check for team defeat before objective scoring.

At zero heat, a suit is exempt from heat checks.

Roll one d6 per heat check and use the same result for both columns below.

| Current heat | Take 1 damage on | Also disable one random order on |
|---|---|---|
| 1 | 1 | — |
| 2–3 | 1–2 | — |
| 4–7 | 1–3 | 1 |
| 8–15 | 1–4 | 1–2 |
| 16+ | 1–5 | 1–3 |

Heat damage removes Hull directly and cannot be blocked, reduced, or prevented.

When a result disables an order, randomly select one eligible entry from the suit's normal orders and counterattack abilities. Already-disabled entries are excluded from subsequent selections. If no eligible entries remain, apply the result's other effects.

Cooling, passive capabilities, Jump, and Flight are protected from heat-based disabling. This protection includes the Flight toggle order and the enabled flight mode.

Heat-disabled normal orders and counterattacks remain unavailable across turns and rounds until cooling restores them.

Track equipment-granted orders and counterattacks separately. Each entry follows its own heat-disabled state. Equipped passive modifiers continue to apply under the existing protections for passive capabilities.

If heat disables a locked normal order before it resolves, cancel that pending order. Its committed team activation remains spent. A normal order canceled before it executes generates zero activation heat.

A canceled normal activation counts toward that suit's normal activation count and toward the requirement to activate every surviving suit before passing. It also counts as having activated for end-of-round heat-check eligibility.

## 12. Cooling

Every Gunpla has a cooling order, usable once per round by that suit.

The order specifies its own cooling calculation. Examples include subtracting three heat or halving current heat. Round down when halving heat, so 5 becomes 2 and 1 becomes 0.

Cooling uses a normal activation. Resolve its cooling effect before applying end-of-activation heat gain. The first activation of the round generates zero heat. A later activation doubles the heat remaining after cooling, or changes zero heat to one.

When the cooling order resolves:

1. Reduce heat according to the order, to a minimum of zero.
2. Restore all orders disabled by heat.
3. Grant exemption from heat checks for the remainder of the round.

After the cooling order finishes, apply its normal activation heat gain. For example, on a repeat activation, a suit at 4 heat using Cooling 3 reduces its heat to 1, then doubles that remaining heat to 2. Its cooling exemption covers the resulting heat check.

The exemption covers subsequent normal activations, counterattacks, and the round's end-of-round check. Heat can continue to accumulate during that round.

For example, a suit starting at zero heat can cool on its first activation, then accumulate 1, 2, and 4 heat on later activations without rolling that round. This sequence spends four team activations.

At the next round, the cooling exemption expires, cooling becomes available again, and each suit's normal activation count resets. Its remaining heat carries over.

## 13. Counterattacks

Counterattacks become usable when their conditions are met. Each specifies its trigger, interrupt timing, effect, usage limit, and any heat cost. Usage limits and heat costs can be combined.

Counterattacks use their trigger timing. Their availability is independent of the selected normal order's phase.

Using a counterattack spends its listed resources when it executes. A counterattack canceled before execution spends zero uses and adds zero heat from that ability. Counterattacks do not spend team activations or increase a suit's normal activation count. Each ability may respond once per triggering event, subject to its round limit.

Resolve a counterattack as follows:

1. Confirm its trigger, availability, and remaining uses.
2. Pay its listed heat cost.
3. Resolve its effect.
4. Make any required heat check.
5. Resolve resulting crashes and collapses, then check for victory.
6. If the match continues, check the remaining declared counterattacks. After all eligible responses have resolved, resume the interrupted action if it can still occur.

Counterattacks cannot trigger other counterattacks. Ordinary Armor and Shielding still resolve against counterattack damage.

A protective counterattack might trigger when an enemy within melee reach declares a ranged attack against an ally. The particular ability determines how it blocks, redirects, or otherwise interrupts the attack.

When several counterattacks respond to the same original action:

1. Players declare their eligible counterattacks.
2. Each player chooses the resolution order of counterattacks belonging to their own team.
3. If both teams have pending responses, use a weighted roll between each team's next chosen counterattack to determine which executes next. If only one team has responses, follow that player's chosen order.
4. Resolve that counterattack, its required heat check, and any resulting crashes or collapses. Check for victory before proceeding.
5. Recheck every remaining response's conditions and availability. Cancel any that no longer qualify, including a response whose required target has moved out of reach. These canceled responses spend zero uses and add zero heat from their listed costs.
6. Repeat until every declared response has resolved or been canceled, then resume the original action if it can still occur.

All these counterattacks respond to the original action. Counterattack effects cannot create additional counterattack triggers.

## 14. Jump and flight

Jump is a passive capability available to some Gunpla. Its rating determines the horizontal width of an obstacle the suit can clear, measured in the direction of travel. For example, Jump 2 allows crossing an obstacle less than 2 inches wide. The suit's sheet supplies its Jump rating.

Horizontal travel during a jump uses the movement granted by the order. Each inch climbed also costs one inch of movement. Descending during a jump costs zero movement inches. The total horizontal travel plus upward travel must fit within the movement allowance.

For example, crossing a wall 1 inch wide and 2 inches tall costs 3 inches of movement, plus any approach or further horizontal travel. The descent costs zero movement. A suit with Jump 2 can clear that wall's width.

Flight is a persistent toggle protected from heat-based disabling. Its activation follows normal order timing and heat handling. Enabling Flight enters Hover. Once enabled, movement can change the suit between flight bands, paying the distance between bands from its movement allowance.

| State | Altitude | Movement bonus | Attack-range bonus | Extra Shielding dice | Effects |
|---|---:|---:|---:|---:|---|
| Grounded | 0 inches | +0 inches | +0 inches | +0 | Eligible to control and contest objectives. |
| Hover | 2 inches | +0 inches | +3 inches | +0 | Can move over terrain. Receives zero Armor from cover. |
| Mid-altitude | 6 inches | +2 inches | +3 inches | +0 | Uses normal flight movement and targeting. |
| High-altitude | 10 inches | +4 inches | +3 inches | +2 | Attacking grounded targets requires an order that permits it. |

The attack-range bonus is gained once at Hover. Hover, Mid-altitude, and High-altitude each use the same +3-inch bonus.

Apply that bonus by extending the upper limit of the weapon's outermost range band by 3 inches. Use that band's hit requirement throughout the extended distance. For example, a weapon with Hit 4+ through 6 inches and Hit 5+ over 6 through 12 inches uses Hit 5+ over 6 through 15 inches while flying.

For distance between bands, measure horizontal center-to-center distance and add the difference in altitude. Same-band distance uses the horizontal measurement.

Flight movement pays for horizontal travel and both ascending and descending. Each inch of altitude change costs one inch of movement. For example, descending from Mid-altitude at 6 inches to Hover at 2 inches costs 4 inches of movement.

Use the movement bonus from the band occupied when that movement step begins. For example, a suit starting in Hover with a normal 6-inch move can spend 4 inches climbing to Mid-altitude and 2 inches moving horizontally. A movement step beginning at Mid-altitude adds its +2-inch movement bonus.

Additional Shielding dice use the suit's normal shielding requirement, including SP modifiers.

Track a suit's flight band with a marker or in the software, keeping its horizontal position represented on the tabletop. The band supplies its altitude value for measurement.

To check airborne line of sight, temporarily place a ruler or height gauge beside the suit's center marker. Its sighting point is the suit's normal torso height plus its flight-band altitude. Check torso-to-torso line of sight between those reference points, using the actual torso for grounded models. Apply the same height adjustment when checking airborne interceptors.

When the chassis permits landing, land through normal movement. Spend the movement needed to descend onto a valid surface, including 2 inches to reach ground level from Hover. Flight automatically switches off on landing. The suit becomes eligible to contribute to objective control. Taking off again requires the Flight toggle order.

## 15. Defeat, wrecks, and destructible terrain

At zero Hull, a suit is defeated. It stops acting and contributing to objective control, and loses any pending order. It stays on the battlefield as a wreck.

Every wreck uses this profile:

| Stat | Value |
|---|---:|
| Wreck Hull | 3 |
| Armor | 1 |
| Shielding dice | 0 |

Wrecks obstruct movement and line of sight, can intercept shots, and can provide cover to either team using the normal cover requirements.

Players may attack wrecks. Successful hits deal normal weapon damage, and Armor blocks one damage per attack. Remove a wreck when its Wreck Hull reaches zero.

Wrecks are neutral obstacles. They intercept when they block the firing line, including within 3 inches of the shooter. The allied interception exception applies to operational allied Gunpla.

After a normal order or counterattack finishes, resolve its heat check and any resulting crashes or collapses, then check for victory. If one team is completely defeated and the other has surviving Gunpla, the surviving team wins. If both teams are completely defeated, the player with more accumulated objective points wins. Equal points produce a draw.

### Airborne wrecks and collisions

A defeated airborne suit crashes toward the ground and can strike other Gunpla or terrain. Its starting flight band determines its crash movement range. Measure crash movement horizontally from its center marker at defeat. Resolve impact before final wreck placement. A surviving wreck is placed in the nearest clear legal position where it fits.

Impact damage is direct Hull damage and cannot be blocked, reduced, or prevented.

Use these starting crash ranges and direct impact values for playtesting.

| Starting band | Maximum horizontal crash movement | Direct impact damage |
|---|---:|---:|
| Hover | 2 inches | 1 |
| Mid-altitude | 6 inches | 2 |
| High-altitude | 10 inches | 3 |

Crash direction and distance are determined by random scatter. For the initial software procedure, independently select an equally likely direction from 0 through 359 degrees and an equally likely whole-inch distance from zero through the band's maximum crash movement. Use a consistent table edge as the direction reference.

Measure from the defeated suit's center marker and move along the straight crash path until impact with the first eligible Gunpla or terrain piece, or until the rolled distance ends. A zero-distance result crashes at the suit's current horizontal position.

If the crash path reaches the battlefield edge before a collision or the end of the rolled distance, remove the wreck as it exits the battlefield.

Use the starting flight band's listed impact damage for an airborne crash. Apply the impact to both the falling wreck and the object struck. A direct hit on the battlefield surface applies damage to the falling wreck. A High-altitude crash deals 3 direct damage and destroys the falling wreck's 3 Hull.

Remove a wreck or destructible terrain piece reduced to zero Hull. An operational Gunpla reduced to zero Hull becomes a wreck. Place any surviving wreck in the nearest clear legal position.

### Terrain profiles

Destructible buildings and other terrain can be attacked and destroyed. At zero terrain Hull, remove the piece from the battlefield. Its former footprint becomes open space for movement and firing lines, and the piece stops providing cover.

Players identify each terrain piece's profile before deployment. Use these starting profiles:

| Terrain | Hull | Armor | Shielding dice |
|---|---:|---:|---:|
| Light terrain, such as crates and barricades | 3 | 0 | 0 |
| Building | 6 | 1 | 0 |
| Reinforced structure | 10 | 2 | 0 |
| Indestructible terrain | — | — | — |

Destructible terrain uses ordinary weapon damage resolution, including its listed Armor. Crash impacts deal direct Hull damage.

Indestructible terrain remains in place throughout the match and has no Hull track. Its shape determines movement obstruction, line-of-sight blocking, and cover under the usual rules. A crash into indestructible terrain stops at the collision and applies impact damage to the crashing wreck. The terrain remains intact.

Models standing on destroyed terrain fall to the next supporting surface. Collapse fall damage is 1 direct damage per 4 inches fallen, rounding up. For example, a 6-inch fall deals 2 direct damage. Resolve any collision using the impact procedure, then place surviving models in the nearest clear legal position.

## 16. Objective-control starter mission

| Element | Standard battlefield | Full-table layout |
|---|---|---|
| Size | 36 × 36 inches | 96 × 43 inches |
| Deployment | Within 6 inches of opposite edges | Within 6 inches of opposite 96-inch edges |
| Objective line | Halfway between deployment edges | 21.5 inches from either deployment edge |
| Objective positions along that line | 9, 18, and 27 inches from one side | 24, 48, and 72 inches from one short end |

The larger layout fits a 96 × 43-inch playing surface. A marked 36-inch square also fits inside that space. Test the standard layout first, then assess the full-table spacing.

Only grounded suits contribute to control or contesting. Each eligible suit within 3 inches of an objective contributes one, regardless of its activation count. The player with more eligible suits controls it. Equal numbers make it contested.

Score one victory point per controlled objective at the end of each round. Control is checked at scoring time.

The starter game lasts five rounds. Highest victory points after round five wins, with equal scores producing a draw. A complete team defeat ends the match after the current resolution and its heat and crash consequences are finished, using the victory procedure in section 15.

## 17. End of round

1. Identify heated suits that took no normal activation and lack the cooling exemption, then roll all their required heat checks before applying any of those results.
2. Apply the heat results, convert defeated suits into wrecks, and resolve resulting crashes and collapses. Check for team defeat using the victory procedure in section 15.
3. Determine objective control and award victory points.
4. Expire effects ending that round.
5. Refresh team activation allowances and per-round usage limits, reset normal activation counts, and expire cooling exemptions for the new round.

Heat and heat-disabled orders carry over. The First Selection token continues its turn-by-turn alternation.

## 18. Worked turn

This example uses temporary suit values and chosen dice results to illustrate the sequence. Unit sheets and points costs will be developed separately.

Both teams began the game with three suits and therefore receive three activations per round. Each team has already spent one activation this round. Blue currently holds the First Selection token.

Blue selects a suit that has activated once this round. It currently has 6 Hull, Armor 1, Shielding 4d6 at 5+, and 2 heat. Red responds by selecting a suit with zero heat that has yet to activate this round. Both are grounded, and Red has a clear firing line with Blue in its weapon's Hit 4+ range band.

The players secretly choose and reveal these orders:

| Player | Order | Phase | Effect |
|---|---|---:|---|
| Red | Rifle Shot | 2 | Attack with 3d6, Hit 4+, Damage 2, SP 1. |
| Blue | Guard | 4 | Gain +1 Armor until the end of the round. |

1. **Phase 2.** Red chooses Blue as the target and rolls 4, 5, and 2. Two successes generate 4 damage.
2. **Armor.** Blue's current Armor 1 blocks 1 damage, leaving 3.
3. **Shielding.** SP 1 raises Blue's shielding requirement from 5+ to 6+. Blue rolls 2, 4, 5, and 6. One success blocks 1 damage, leaving 2 Hull damage. Blue drops from 6 to 4 Hull.
4. **Red's activation ends.** This is that suit's first activation of the round, so it generates zero activation heat. At zero heat, it makes zero heat checks.
5. **Phase 4.** Blue's Guard resolves, increasing its Armor from 1 to 2 until the end of the round.
6. **Blue's activation ends.** This is its second activation of the round, so its 2 heat doubles to 4. Its heat check rolls a 2. At 4 heat, that result deals 1 direct damage and disables zero orders. Blue drops from 4 to 3 Hull.
7. **Turn ends.** Both teams still have surviving suits, so the match continues. Pass the First Selection token from Blue to Red. Each team has one activation left this round. Objective scoring occurs at the end of the round.

Blue finishes with 3 Hull, 4 heat, and Armor 2 through the end of the round. Red's selected suit finishes at zero heat. Red will select a suit first on the next turn.

## 19. Prototype preparation

1. Review the modular HG starter chassis, equipment cards, upgrades, and timing clarifications, then assess chassis and component points through playtesting.
2. Use the first starter match rosters of two differently equipped Zakus against two differently equipped GMs, at 200 proposed points per player. Track all four builds independently.
3. Play a complete objective-control match, record unclear interactions and balance results, then adjust the starting values.
