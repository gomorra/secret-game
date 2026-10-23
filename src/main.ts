import { Application } from 'pixi.js';
import { BALANCE } from './data/balance';
import { Camera } from './render/camera';
import { COLORS, TILE } from './render/palette';
import { WorldView } from './render/world';
import { createGame } from './sim/state';
import { step } from './sim/tick';
import { Controller } from './ui/controller';
import { Hud } from './ui/hud';

/** Max sim steps per frame, so a slow frame can't spiral. */
const MAX_STEPS_PER_FRAME = 40;
const HUD_INTERVAL = 0.2;

function seedFromUrl(): string {
  const param = new URLSearchParams(location.search).get('seed');
  return param || Math.random().toString(36).slice(2, 8);
}

async function main(): Promise<void> {
  const seed = seedFromUrl();
  const state = createGame(seed);

  const app = new Application();
  await app.init({ resizeTo: window, background: COLORS.background, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 });
  document.getElementById('game')!.appendChild(app.canvas);

  const world = new WorldView(state);
  app.stage.addChild(world.root);

  const camera = new Camera(state.map.width * TILE, state.map.height * TILE);
  const warehouse = state.buildings.find((b) => b.type === 'warehouse')!;
  camera.x = (warehouse.x + 1) * TILE;
  camera.y = (warehouse.y + 1) * TILE;

  let hud: Hud | null = null;
  const ctl = new Controller(app.canvas, camera, state, (msg) => hud?.toast(msg));
  hud = new Hud(document.getElementById('hud')!, state, ctl);
  document.title = `Fogbound · ${seed}`;
  // Handy for poking at the game from the browser console.
  (window as unknown as { fogbound: unknown }).fogbound = { state, camera, ctl };

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
    world.update(dt, ctl.overlay());
    hudTimer += dt;
    if (hudTimer >= HUD_INTERVAL) {
      hudTimer = 0;
      hud!.update();
    }
  });
  hud.update();
}

main();
