import { Application } from 'pixi.js';
import { BALANCE } from './data/balance';
import { Camera } from './render/camera';
import { COLORS, TILE } from './render/palette';
import { WorldView } from './render/world';
import { nextLegacy } from './sim/lore';
import { serialize } from './sim/save';
import { createGame, type GameState } from './sim/state';
import { advance, step } from './sim/tick';
import { placeBuilding } from './sim/build';
import type { BuildingId } from './data/buildings';
import { Controller } from './ui/controller';
import { showFinale } from './ui/finale';
import { Hud } from './ui/hud';
import { clearLegacy, loadLegacy, saveLegacy } from './ui/legacyStore';
import { Menu } from './ui/menu';
import { clearGame, loadGame, saveGame, storeRaw } from './ui/saveStore';
import { Sound } from './ui/sound';
import { installTooltips } from './ui/tooltip';

/** Max sim steps per frame, so a slow frame can't spiral. */
const MAX_STEPS_PER_FRAME = 40;
const HUD_INTERVAL = 0.2;
/** Seconds of real time between autosaves. */
const AUTOSAVE_INTERVAL = 30;

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Go to an island: a saved one with this seed loads, otherwise a new one starts. */
function goToSeed(seed: string): void {
  const url = new URL(location.href);
  url.searchParams.set('seed', seed);
  location.href = url.toString();
}

/**
 * Pick the game to play. The saved colony loads unless the URL asks for a different island.
 * A save whose bell was already rung is over: the next cycle starts instead.
 */
function startingGame(): { state: GameState; note?: string } {
  const urlSeed = new URLSearchParams(location.search).get('seed');
  const saved = loadGame();
  if (saved.state && !saved.state.bellRung) {
    if (!urlSeed || urlSeed === saved.state.seed) return { state: saved.state };
    // A link to another island would replace the saved colony at the next save, so ask first.
    const leaveIt = confirm(
      `This link opens island ${urlSeed}. Your colony on island ${saved.state.seed} will be replaced when the game next saves.\n\n` +
        'OK opens the new island. Cancel goes back to your colony.',
    );
    if (!leaveIt) return { state: saved.state };
  }
  const seed = urlSeed || randomSeed();
  return { state: createGame(seed, loadLegacy()), note: saved.state ? undefined : saved.error };
}

async function main(): Promise<void> {
  const { state, note } = startingGame();
  // Keep the seed in the URL so a reload comes back to this island.
  const url = new URL(location.href);
  if (url.searchParams.get('seed') !== state.seed) {
    url.searchParams.set('seed', state.seed);
    history.replaceState(null, '', url.toString());
  }

  const app = new Application();
  await app.init({ resizeTo: window, background: COLORS.background, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 });
  document.getElementById('game')!.appendChild(app.canvas);

  const world = new WorldView(state);
  app.stage.addChild(world.root);

  const camera = new Camera(state.map.width * TILE, state.map.height * TILE);
  const warehouse = state.buildings.find((b) => b.type === 'warehouse')!;
  camera.x = (warehouse.x + 1) * TILE;
  camera.y = (warehouse.y + 1) * TILE;

  const sound = new Sound();
  let hud: Hud | null = null;
  const ctl = new Controller(app.canvas, camera, state, (msg) => hud?.toast(msg));
  ctl.sfx = (id) => sound.play(id);
  ctl.onMute = () => sound.toggleMute();
  const hudRoot = document.getElementById('hud')!;
  installTooltips(hudRoot);

  // Saving. Stops for good once the bell has rung: that island is gone.
  let lastSaved: number | null = null;
  let saveTimer = 0;
  /** Set when navigating away on purpose, so the save on page hide doesn't undo it. */
  let leaving = false;
  const leave = (seed: string) => {
    leaving = true;
    goToSeed(seed);
  };
  /** Saving is over once the bell rings or we are leaving on purpose. */
  const saving = () => !state.bellRung && !leaving;
  const save = (): boolean => {
    saveTimer = 0;
    if (!saving()) return false;
    const ok = saveGame(state);
    if (ok) lastSaved = performance.now();
    return ok;
  };

  const onRing = () => {
    ctl.paused = true;
    // Wake into the next cycle even if the page is closed during the finale.
    saveLegacy(nextLegacy(state));
    clearGame();
    // Point the URL at the next island now, so a reload during the finale doesn't replay this one.
    const next = randomSeed();
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set('seed', next);
    history.replaceState(null, '', nextUrl.toString());
    sound.play('toll');
    showFinale(document.body, state, () => leave(next));
  };
  const onForget = () => {
    clearLegacy();
    clearGame();
    leave(randomSeed());
  };
  const menu = new Menu(hudRoot, state, ctl, sound, {
    save: () => {
      const ok = save();
      hud?.saved(ok);
      return ok;
    },
    lastSaved: () => lastSaved,
    load: (loaded) => {
      if (storeRaw(serialize(loaded))) leave(loaded.seed);
      else hud?.toast('Your browser would not store the save.');
    },
    newIsland: () => {
      clearGame();
      leave(randomSeed());
    },
  });
  ctl.onMenu = () => menu.toggle();
  hud = new Hud(hudRoot, state, ctl, onRing, onForget, sound, () => menu.toggle());
  if (note) hud.toast(`${note} Starting a new island.`, false);
  document.title = `Fogbound · ${state.seed}`;
  // Handy for poking at the game from the browser console.
  (window as unknown as { fogbound: unknown }).fogbound = {
    state,
    camera,
    ctl,
    world,
    sound,
    save,
    menu,
    place: (type: BuildingId, x: number, y: number) => placeBuilding(state, type, x, y),
    advance: (seconds: number) => advance(state, seconds),
  };

  // Save when the tab is hidden or closed, so nothing is lost by walking away.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', () => save());

  let acc = 0;
  let hudTimer = 0;
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.25);
    ctl.frame(dt);
    if (!ctl.paused) {
      acc += dt * ctl.speed;
      let n = 0;
      while (acc >= BALANCE.tick && n < MAX_STEPS_PER_FRAME) {
        step(state);
        acc -= BALANCE.tick;
        n++;
      }
      if (n === MAX_STEPS_PER_FRAME) acc = 0;
    }
    camera.apply(world.root, app.screen.width, app.screen.height);
    world.effects(state.fx.splice(0));
    world.update(dt, ctl.overlay());
    hudTimer += dt;
    if (hudTimer >= HUD_INTERVAL) {
      hudTimer = 0;
      hud!.update();
    }
    saveTimer += dt;
    if (saveTimer >= AUTOSAVE_INTERVAL) {
      if (saving()) hud!.saved(save());
      else saveTimer = 0;
    }
  });
  hud.update();
}

main();
