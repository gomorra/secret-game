# Handoff: Fogbound after M6 and M7

For a fresh session picking up `feat/prototype-m0-m2`. Read this, then `README.md` and `docs/GAME_PLAN.md`.
The plan's §4.8 is the game's secret: never put it in player-facing text outside the finale.

## Where things stand

- Branch `feat/prototype-m0-m2` has milestones M0–M7 done (all ticked in the plan). **No PR yet.**
- Commits from the last session:
  - `b45a01e` M6: saves, objectives, sound, tooltips, feedback
  - `399ddf2` M7: balance tuning, playtest bot, game rule changes
  - `8699e5d`, `a4c9de0`: removed a stray `snapshot.json`; snapshot output goes to git-ignored `tools/out/`
- Last check: 113 tests pass, typecheck and build clean, both browser playtests pass with no page errors.

## Next steps

1. ~~Code review of the M6 + M7 diff~~ Done; see "Review results" below.
2. Open the PR (the user hasn't asked for one yet; check with them first).
3. Still open: a real human playtest of the 45-minute target, late-game coin sinks, frame rate on a real GPU.

## Review results (after M7)

Fixed:
- `ensureResources` could paint a later patch (marsh) over an earlier rock patch and push rock out of reach
  (seeds `s114`, `s171`). Patches no longer paint over another resource. Checked on 400 seeds; the map test
  now asserts the exact limit, with those two seeds added.
- `revive` rebuilds each building field by field (`reviveBuilding`): tier, residents, dread, supply, progress and
  status are checked and clamped; duplicate ids, overlaps and footprints off the map are dropped. Sites too.
- A `?seed=` link to another island now asks before replacing the saved colony (Cancel keeps it).
- Ringing the bell points the URL at the next island at once, so a reload during the finale doesn't replay the old one.
- Autosave no longer fires every frame (showing "Could not save") after the bell; `save()` always resets its timer.
- Menu "Save now" styles its message by this save's result, and names the bell when that's why.
- Info toasts (the unreadable-save note) no longer play the error sound: `hud.toast(msg, false)`.
- `fitTopBar` only re-measures when the bar's text, tier or window width changes.
- Stale "unmet needs pay no tax" wording in the Needs tooltip and the `TierDef.tax` comment.

Checked, left as is: key handling (menu capture + controller both skip textareas; Esc closes the menu only),
the tooltip interval, objective scans. Floating `Text` per production: Pixi v8 already shares one texture between
identical live texts and pools freed ones, so no pool was added.

After the fixes the playtest medians are about the same (T2 unlock 4:11, first T2 ~15, T3 unlock ~24, first T3 ~40),
and all 10 islands reach a Scholar house within 60 min.

## How to check your work

```sh
npm test                 # 113 Vitest specs, ~6 s (includes a one-island pace check)
npm run typecheck
npm run build
npm run playtest         # bot plays 10 islands for 60 game-minutes, prints a pace table (~60 s)
SEEDS=fog MINUTES=30 VERBOSE=1 EVERY=120 npm run playtest   # one island, with census table and build log

# Browser (headless Chromium; Playwright is installed globally, browser in /opt/pw-browsers):
npm run build && npx vite preview --port 4173 &   # run in the background
node tools/browser/smoke.mjs   # colony, goals, effects, tooltips, menu, reload, export/import
node tools/browser/cycle.mjs   # Tolling, house tooltip, ring the bell → save cleared → cycle 2
# Screenshots land in tools/out/shots/. Look at them; "GL Driver Message" console lines are harmless swiftshader noise.
```

`window.fogbound` exposes `{ state, camera, ctl, world, sound, save, menu, place(type, x, y), advance(seconds) }`
for driving the game from a browser script.

Expected playtest table (median of 10 islands): Lamplighters unlock ~4 min, first Lamplighter house ~15,
Scholars unlock ~23, first Scholar house ~39. 9/10 islands reach a Scholar house within 60 min. `wick` doesn't
(bot weakness), and `ember` is slow (wood-poor start).

## What M6 added (where to look)

| Piece | Files | Notes |
|---|---|---|
| Save format | `src/sim/save.ts` | `serialize` / `deserialize` / `exportString`. Versioned (`SAVE_VERSION = 1`, `MIGRATIONS` map). Skips `events` and `fx`; derived caches live in WeakMaps so are never on the state. Terrain and explored grids are run-length encoded. Export string is `FOGBOUND1:` + base64. `revive` validates and drops bad parts, and throws `SaveError` for unreadable saves. |
| Save storage | `src/ui/saveStore.ts` | Key `fogbound.save`. An unreadable save is moved to `fogbound.save.unreadable` instead of being overwritten. Legacy stays separate in `legacyStore.ts` (`fogbound.legacy.v1`). |
| Startup / autosave | `src/main.ts` | `startingGame()`: load the save unless the URL `?seed=` differs or the save's bell was rung. Autosave every 30 s of real time, plus on `visibilitychange` (hidden) and `pagehide`. A `leaving` flag stops the page-hide save from undoing an import, a new island or forget. Ringing the bell saves the legacy and clears the save immediately. |
| Menu | `src/ui/menu.ts` | Save now, export/copy, import, sound, new island. Pauses while open. A capture-phase keydown listener swallows game hotkeys while open (except typing in textareas). |
| Objectives | `src/sim/objectives.ts` | `SHORT_GOALS` and `MEDIUM_GOALS` lists; finished ids stored in `state.goals` (saved). Checked once per sim second from `tick.ts`. Only goals on show emit a `goal` event; others finish quietly. |
| Sim effect cues | `state.fx` + `pushFx` in `src/sim/state.ts` | `made` (economy), `upgrade` and `lost` (population). Capped at 200, drained each frame in `main.ts` → `world.effects()`. |
| World effects | `src/render/world.ts` | Floating text, rings, wisps (max 40 alive); buildings pop in from their centre (pivot moved to the centre). |
| Sound | `src/ui/sound.ts` | All synthesized. Context starts on first pointer/key. Mute is stored in `fogbound.settings.v1`. Surge drone follows `tolling.strength`. |
| Tooltips | `src/ui/tooltip.ts` | `tip(el, text)` sets `data-tip`. Follows re-rendered elements under a resting cursor, because the info panel re-renders constantly. |
| HUD | `src/ui/hud.ts`, `src/ui/text.ts` | Goals panel, coin jump deltas, goods flow tooltips (`goodsFlow` in `economy.ts`), mute/menu buttons, top bar compacts in two steps when crowded (`fitTopBar`). |

## What M7 changed (game rules, not just numbers)

Full rationale is in `docs/GAME_PLAN.md` §7, "Balance notes (M7)". In short:
- **Upgrades cost a first stock of the new tier's goods** (`src/data/tiers.ts` `upgradeCost`; the blocker message is in `population.ts`).
- **Tax tapers** with need supply: `needSatisfaction` / `taxShare` in `population.ts`, `BALANCE.taxCutoff = 0.5`. A `needsUnmet` house now pays partial tax.
- **Resource patches:** `ensureResources` and `patchDistance` in `src/sim/map.ts`, called from `createGame` after `findStartSite`. This changes some seeds' maps.
- Numbers: tier unlocks at 60/50, taxes 2 / 3.5 / 6, cheaper tier 2–3 buildings, whaler and rendery cycle 15 s, brazier burn 1.2.

Tools: `tools/bot.ts` (playtest bot: grid roads every 5 tiles, starter chains, demand-driven production,
brazier expansion), `tools/playtest.playtest.ts`, `tools/terrain.playtest.ts` (terrain reach per seed),
`tools/snapshot.playtest.ts` (writes a bot colony save, e.g. to load in the browser via localStorage).
They run with `tools/vitest.config.ts`, kept out of `npm test`. `tests/balance.test.ts` imports the bot.

## Code review focus (done; kept for reference)

Spots the first review looked at:
1. `save.ts` `revive`: buildings and sites are spread from raw JSON (`...raw`) after only id/type/x/y checks, so their numeric fields (residents, tier, supply, progress, dread…) aren't validated. A hand-edited import could carry NaN or odd tiers into the sim.
2. `main.ts`: a URL `?seed=` that differs from the save starts a new island, and the next autosave overwrites the old colony without a backup. This is documented in the README, but maybe it deserves a confirm or a backup key.
3. `main.ts` save/leave guards: the bell, import, new island and forget paths all rely on the `leaving` flag and `bellRung`. Worth tracing each path, including closing the tab during the finale.
4. `menu.ts` and `controller.ts` key handling: both listen on `window`; the menu uses capture. Check Esc behaviour, and that hotkeys can't fire while typing in the import box.
5. `objectives.ts`: `coastLit` scans the whole lit grid each sim second, and `hasWorking` scans buildings for every unfinished goal. Probably fine; worth a glance at larger colonies.
6. `hud.ts` `fitTopBar`: removes and re-adds classes and reads layout five times a second.
7. `tooltip.ts`: a `setInterval` that never stops (one per page; harmless?).
8. `population.ts`: the tax taper means `needsUnmet` houses pay tax. Check everything that assumed "unmet → 0" (HUD text, tests, the info panel's tax row).
9. `map.ts` `ensureResources`: patches stay at least 6 tiles from the landing. Can they block the lantern spot, sit under a site, or cut the island apart?
10. `tests/balance.test.ts` depends on bot heuristics, so it may break on bot changes, not just balance changes.
11. `world.ts`: a new `Text` per production completion (capped at 40). Possible GC churn in big colonies; a pool or BitmapText would avoid it.

## Known caveats

- The "~45 min for a person" figure is an estimate from bot times, not a human playtest.
- Frame rate was only measured with headless software GL: a fresh island gets 9 fps, a 580-building colony gets 4. JavaScript per frame on that colony is about 5 ms, mostly the fog layer (`fogLayer.ts`). A real GPU should be fine, but it's unmeasured.
- Coins pile up after ~50 minutes; the late game needs sinks.
- Higher tiers still need only their own goods (plan §4.3 table, taken literally). The user flagged this as a rough edge; I left it unchanged.

## Working style the user asked for

- Vitest specs for sim logic. After UI changes, playtest in headless Chromium and look at the screenshots.
- Dark palette, warm light, short HUD text. Plain words in docs and UI.
- Commit and push to `feat/prototype-m0-m2`. Don't open a PR unless asked.
