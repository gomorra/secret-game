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
| Hotkeys | `R` road, `H` house, `X` demolish |
| Cancel / deselect | Right-click or `Esc` |
| Pause / speed | `Space`, `1` `2` `3` (1×, 2×, 4×) |

## How to play (so far)

1. Lay a road from your warehouse. Every building needs a road connection to a warehouse.
2. Build houses. Castaways move in and pay tax while they have **fish** and **wood**.
3. Build a **fishery** by open water and a **woodcutter** near forest. Watch the efficiency shown while placing.
4. A **sawmill** turns wood into planks, which you need for bigger buildings.

## Code layout

```
src/
  sim/     pure game logic, no rendering (state, map, build, economy, population, tick, rng)
  data/    buildings, goods, tiers, balance numbers
  render/  PixiJS: terrain painter, world view, camera
  ui/      HTML HUD and input controller
tests/     Vitest specs for the sim
```
