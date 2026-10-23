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

Add `?seed=anything` to the URL to play a specific island. Without it you get a random one, or your saved colony if you have one.

## Controls

| Action | Input |
|---|---|
| Pan | Drag, right-drag, or WASD / arrow keys |
| Zoom | Mouse wheel |
| Build | Pick a building in the bottom bar, then click. Drag to lay roads |
| Hotkeys | `R` road, `H` house, `B` brazier, `X` demolish, `C` codex |
| Cancel / deselect | Right-click or `Esc` |
| Menu (save, export, import, new island) | `Esc` with nothing selected, or ☰ |
| Pause / speed | `Space`, `1` `2` `3` (1×, 2×, 4×) |
| Sound on / off | `M` or 🔊 |

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
Hover almost anything for a tooltip: goods show what is made and used per minute, and buildings show what is wrong with them.

The **goals** panel at the top left always shows one short goal and one longer one. Hover a goal for a hint.

### Saving

- The game saves itself in your browser every 30 seconds and whenever you leave the tab. Opening the game again picks up where you left off.
- The menu (`Esc`) can save right away, export your colony as a string to copy elsewhere, and import one back.
- A URL with a different `?seed=` starts that island instead, and the next autosave replaces your old colony. Export first if you want to keep it.
- Ringing the Drowned Bell ends the island for good: the save is cleared and the next cycle begins.

## Code layout

```
src/
  sim/     pure game logic, no rendering (state, map, build, economy, population, fog,
           lore, objectives, save, tick, rng)
  data/    buildings, goods, tiers, lore, relics, balance numbers
  render/  PixiJS: terrain painter, world view and effects, fog, camera
  ui/      HTML HUD, input controller, menu, tooltips, codex, finale, sound,
           and browser storage (saveStore for the island, legacyStore for what carries over)
tests/     Vitest specs for the sim
```
