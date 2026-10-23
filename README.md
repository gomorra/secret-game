# Fogbound

An Anno-style colony builder in the dark. Build production chains, grow your settlers, and keep the lights burning against a living fog.

The full design is in [`docs/GAME_PLAN.md`](docs/GAME_PLAN.md) (contains spoilers).

## Run it

```sh
npm install
npm run dev       # dev server at http://localhost:5173
npm test          # simulation tests
npm run build     # static build in dist/
```

Add `?seed=anything` to the URL to play a specific island. Without it you get a random one.

## Controls

| Action | Input |
|---|---|
| Pan | Drag, right-drag, or WASD / arrow keys |
| Zoom | Mouse wheel |
| Build | Pick a building in the bottom bar, then click. Drag to lay roads |
| Hotkeys | `R` road, `H` house, `B` brazier, `X` demolish, `C` codex |
| Cancel / deselect | Right-click or `Esc` |
| Pause / speed | `Space`, `1` `2` `3` (1×, 2×, 4×) |

## How to play (so far)

1. You can only build where it's **lit**. The Last Lantern lights a small circle and never goes out. **Braziers** burn wood to push the fog back further. Your first goal is usually a brazier or two toward the coast so you can build a fishery.
2. Lay a road from your warehouse. Every building, lights included, needs a road connection to a warehouse.
3. Build houses. Castaways move in and pay tax while they have **fish** and **wood**.
4. Build a **fishery** by open water and a **woodcutter** near forest. Watch the efficiency shown while placing.
5. A **sawmill** turns wood into planks, which you need for bigger buildings.
6. At **30 Castaways**, Lamplighters unlock. Full, content houses upgrade on their own once the warehouse has their new needs in stock: **bread** (wheat farm → mill → bakery) and **lamp oil** (whaler → rendery). They also pay a small amount of planks to upgrade.
7. At **40 Lamplighters**, Scholars unlock. They want **candles** (apiary → chandlery) and **books** (reed cutter → paper mill, ink boat → bookbinder).
8. Each tier pays more tax, and 25% more again with its service building in range: **Shrine**, **Tavern**, **Archive**.
9. Lamplighters unlock **lantern posts** and **lighthouses**, which burn lamp oil. Your people want lamp oil too, so the lights and the houses compete for it.

### The fog

- If a light runs out of fuel, it fades and the fog creeps back. Buildings in the dark stop working, and houses in the dark pay no tax.
- **The Tolling:** every 8 minutes a bell rings beneath the sea. One minute later the fog surges for a minute and every light shrinks by 30%. Turn on **Double fuel** (next to the countdown) to keep your fuelled lights at full size, at twice the cost. The Last Lantern always shrinks.
- **Dread:** houses grow afraid in the dark, when their needs go unmet, and during a surge. Content houses and shrines calm them. At 100% dread the residents walk into the fog and the house stands empty for a while.

### What hides in the fog

Faint markers show where something waits in explored fog. Bring light to it to find out what:

- **Ruins** hold coins and materials to salvage.
- **Journals** add pages to your **codex** (`C`). Some pages are in cipher; an **Archive** can read them, slowly.
- **Relics** give permanent bonuses that you keep from cycle to cycle.
- **Whispering stones** offer a bargain. Click one to listen.
- **The Drowned Bell** waits on a far shore. The journals explain how to ring it. Ringing it ends the cycle: you wake on a new island with your relics, your codex and a few memories, and lose everything else.

What carries between cycles is kept in your browser. "Forget everything" at the bottom of the codex resets it.

Click a house to see its needs and what is holding back its upgrade. Click a warehouse to see everything in storage.

## Code layout

```
src/
  sim/     pure game logic, no rendering (state, map, build, economy, population, tick, rng)
  data/    buildings, goods, tiers, balance numbers
  render/  PixiJS: terrain painter, world view, camera
  ui/      HTML HUD and input controller
tests/     Vitest specs for the sim
```
