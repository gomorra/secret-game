# Fogbound — Game Plan

> Working title. Anno-style colony builder in the dark. Solo, desktop browser.
>
> ⚠️ **Spoilers:** section 4.8 has the game's secret. Keep it out of anything players see.

## 1. Pitch

You land on an archipelago swallowed by a living fog. **Light is your most precious resource.**
Every brazier and lighthouse pushes the fog back and reveals land, ruins, and clues about the
colony that vanished here before you. Build production chains, grow your settlers through
population tiers, and keep the lights burning.

## 2. Design pillars

1. **Production chains that hum.** Anno's core joy: raw goods → refined goods → happy citizens → more coins → bigger chains.
2. **Light vs. fog.** Light costs fuel. Fuel competes with what your people need. That tension shapes every decision.
3. **Every fog tile hides something.** Curiosity drives expansion: ruins, journals, relics, rich land, or something worse.

## 3. Core loops

| Loop | Length | What the player does | Reward |
|---|---|---|---|
| Moment | seconds | Place buildings, fix shortages, connect roads | Chains start flowing, numbers rise |
| Session | 10–30 min | Reach the next population tier, survive the next fog surge, light a new area | New buildings unlock, new land revealed |
| Long | hours | Uncover the mystery, fill the codex, collect relics, ring the Drowned Bell | Story reveals, permanent bonuses, a new cycle on a new archipelago |

## 4. Systems

### 4.1 Map & building
- Top-down square grid (isometric can come later).
- Procedurally generated island from a seed. Terrain: grass, fertile soil, forest, marsh, rock, coast.
- Buildings must connect by road to a **warehouse**. Goods go to the warehouse after each production cycle (no carts in the prototype).
- You can only build on tiles that are **lit**.

### 4.2 Goods & production chains (prototype)

| Chain | Steps | Used for |
|---|---|---|
| Wood | Woodcutter (forest) → Wood | Castaway need, brazier fuel, construction |
| Planks | Wood → Sawmill → Planks | Construction |
| Stone | Quarry (rock) → Stone | Construction (tier 2+) |
| Fish | Fishery (coast) → Fish | Castaway food |
| Bread | Wheat farm (fertile) → Mill → Flour → Bakery → Bread | Lamplighter food |
| Lamp oil | Whaler (coast) → Blubber → Rendery → Lamp oil | Lamplighter need **and** fuel for lanterns/lighthouses |
| Candles | Apiary → Wax → Chandlery → Candles | Scholar need |
| Books | Reed cutter (marsh) → Reeds → Paper mill → Paper, Ink boat (coast) → Ink; Paper + Ink → Bookbinder → Books | Scholar need |

Lamp oil is the key tension: your people want it, and your lights burn it.

### 4.3 Population tiers

| Tier | Name | Basic needs (required) | Luxury (bonus) | Unlocks |
|---|---|---|---|---|
| 1 | Castaways | Fish, Wood | Shrine nearby | Woodcutter, Sawmill, Fishery, Brazier, Shrine |
| 2 | Lamplighters | Bread, Lamp oil | Tavern nearby | Farm chain, Whaler, Rendery, Lantern post, Lighthouse, Quarry |
| 3 | Scholars | Candles, Books | Archive nearby | Candle and book chains, Archive (decodes lore) |
| 4 | *(later)* Dreamers | Strange goods from the fog | ? | Endgame |

- A house upgrades once its current tier's needs are met (and you pay the upgrade cost).
- Higher tiers pay more tax and unlock buildings at population thresholds.
- Unmet basic needs → house stops paying tax and dread rises.

### 4.4 Light & fog
- Each tile is **dark**, **explored** (seen once, not buildable) or **lit** (buildable, buildings work).
- Light sources by tier:
  - **The Last Lantern**: your starting light, burns forever, small radius.
  - **Brazier** (T1): burns wood, small radius.
  - **Lantern post** (T2): burns lamp oil, medium radius.
  - **Lighthouse** (T2): burns lots of lamp oil, large radius, reveals far across the sea.
- If a light runs out of fuel, its area goes dark. Buildings there stop, and residents start to fear.
- **The Tolling (fog surge):** every ~8 minutes a bell rings from under the sea. You get a 60 s warning, then the fog surges for 60 s and shrinks all light radii by 30% unless you burn double fuel. This gives the game a rhythm of tension and relief.

### 4.5 Dread
- Each house has a dread value from 0 to 100.
- Rises when the house is unlit, needs are unmet, or during a Tolling.
- Falls with Shrine coverage and fully met needs.
- At 100, the residents **walk into the fog**. The house stands empty with its door open. This is the signature creepy moment.

### 4.6 Secrets & lore
- When the fog clears it reveals: **ruins** (salvage materials), **journals** (lore pages), **relics** (permanent bonuses), **fertile land**, **whispering stones**, and the **Drowned Bell**.
- **Whispering stones** offer a deal: +50% production on the island, but dread rises everywhere. A tempting choice.
- **Codex:** collected lore pages. Some are encrypted, and the Archive (T3) deciphers them.
- **Prototype mystery:** "What happened to the Lantern Company?" The trail of journals leads to the Drowned Bell and the first big reveal.

### 4.7 Economy
- Coins come from house taxes. Every production building has upkeep.
- Construction costs coins plus wood/planks/stone.
- The challenge is to grow without going broke, and to burn light without starving people.

### 4.8 The secret & time-loop cycles (SPOILERS)

**The twist: the fog is alive, and it eats light.** The Lantern Company didn't flee or die.
Its colonists walked into the fog and *became* it. The whispers are their voices.

How the twist shows up in play:
- **The fog is hungry, not just weather.** It creeps fastest toward your brightest areas. Lighthouses attract it, so more light means more pressure.
- **Journals get stranger** as you find more: first logs, then pleas, then pages written *from inside* the fog.
- **Residents who walk into the fog are not gone.** Their names turn up later in whispers and journal pages.

**Cycles (time loop):**
- Ringing the **Drowned Bell** ends the cycle. The fog swallows the colony and the screen goes dark.
- You wake on a **new archipelago** (new seed) with:
  - kept: relics, codex pages, unlocked knowledge (for example, starting with tier 1 buildings already researched)
  - lost: buildings, goods, coins
- **The fog remembers you.** Your lost residents from earlier cycles speak in the new fog. Their names, their last needs.
- Each cycle reveals a new layer of the truth. The final question is whether you feed the fog, starve it, or join it. That is the endgame after the prototype.

Prototype scope: one full cycle, then the reveal, then the start of cycle 2 with relics carried over.

## 5. Why it's hard to put down

- **There's always a next goal.** The objective tracker shows one short goal and one medium goal.
- **"Just one more tier."** Every upgrade visibly unlocks new buildings.
- **Curiosity.** Fog hides rewards of different sizes, and rumors hint at what's out there ("bells to the north…").
- **Tension and relief.** The Tolling builds pressure and then releases it.
- **Satisfying feedback.** Light blooms as fog peels back, houses visibly upgrade, coins tick up, and sounds match.
- **Collection.** Codex percentage and a relic shelf.
- **Replay.** Every cycle brings a new map, keeps your relics and lore, and reveals a little more of the secret.

**What we avoid:** no monetization, no fake timers, nothing that punishes you for being away. Autosave, and pause anytime.

## 6. Tech plan

- **TypeScript + Vite**: fast dev server, static build.
- **PixiJS v8**: 2D WebGL rendering, with the fog as a render texture or shader so light looks soft.
- **HTML/CSS overlay** for the HUD and menus (plain TS for the prototype).
- **Pure TS simulation** with fixed ticks, kept separate from rendering. Speed controls: pause / 1× / 2× / 4×.
- **Data-driven content** (buildings, goods, tiers, lore in `src/data/`) so balancing means editing numbers, not code.
- **Seeded RNG** so maps can be reproduced.
- **Vitest** for simulation tests (economy, needs, fog).
- **Saves** in localStorage: versioned JSON, autosave every 30 s, export/import as a string.
- **Hosting** on GitHub Pages via Actions.
- **Art:** simple shapes plus Kenney CC0 assets as placeholders. Dark palette with warm light colors.

```
src/
  main.ts
  sim/          # pure game logic, no rendering
    state.ts  tick.ts  map.ts  economy.ts  population.ts  fog.ts  lore.ts  save.ts  rng.ts
  data/         # buildings.ts goods.ts tiers.ts lore.ts balance.ts
  render/       # Pixi: world.ts fogLayer.ts camera.ts sprites.ts
  ui/           # hud.ts buildMenu.ts infoPanel.ts objectives.ts codex.ts
tests/          # vitest specs for sim/
```

## 7. Prototype milestones

- [x] **M0 Skeleton:** Vite + TS + Pixi. A procedural island renders, with camera pan and zoom.
- [x] **M1 Building:** Place and demolish roads, houses, and the warehouse. Costs apply and road connections are checked.
- [x] **M2 Economy:** Goods, production cycles, warehouse storage, coins, tax, upkeep, and a resource HUD.
- [x] **M3 Population:** Tier 1 → 2 → 3 upgrades based on needs, and buildings unlock at population thresholds.
- [x] **M4 Light & fog:** Fog grid, fueled lights, build-only-in-light, fog creeping back, and the Tolling. Dread (4.5) is included here too.
- [x] **M5 Secrets & cycle:** Fog contents, ruins, journals, relics, the codex, the Drowned Bell finale, and the reset into cycle 2 with relics carried over.
- [x] **M6 Feel & save:** Autosave, speed controls, objectives, tooltips, sound, and visual polish.
- [ ] **M7 Playtest & balance:** Tune the numbers toward a 45-minute run that reaches tier 3.

**The prototype works if** a playtester keeps playing past 30 minutes without being asked, reaches tier 3, and wants to know what's under the fog.

## 8. Decisions

| Topic | Decision |
|---|---|
| Genre | Anno-style colony builder (production chains + population tiers) |
| Players | Solo, no backend |
| Theme | Dark & mysterious |
| Platform | Desktop-first (mouse + keyboard) |
| Long-term structure | Time-loop cycles: new map each cycle, relics and lore kept |
| Threats | Only the fog (darkness, dread, the Tolling). No combat |
| Twist | The fog is alive and eats light. The lost colonists became the fog |
| Islands | One island for the prototype *(default, not yet confirmed)* |
| First goal | Playable prototype (M0–M7) |

## 9. Later ideas

- Multiple islands, ships, trade routes, island-specific fertility
- Tier 4 "Dreamers" with goods that only exist inside the fog
- The endgame choice: feed, starve, or join the fog
- Touch controls and a phone layout
- Isometric art, animated carts, fog that breathes in slow cycles
- Achievements, statistics, map seeds you can share
