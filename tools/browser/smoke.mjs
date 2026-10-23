// Browser playtest: Builds a little colony, checks goals, effects, tooltips, the menu, reload, export and import.
// Needs `npm run build && npx vite preview --port 4173` running. Screenshots go to tools/out/shots/.
// Run: node tools/browser/smoke.mjs   (Playwright from the global install; set BASE for another URL.)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const SHOTS = new URL('../out/shots/', import.meta.url).pathname;
const BASE = process.env.BASE ?? 'http://localhost:4173';
await import('node:fs').then((fs) => fs.mkdirSync(SHOTS, { recursive: true }));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('dialog', (d) => d.accept());
await page.goto(BASE + '/?seed=fog');
await page.waitForFunction(() => window.fogbound);
await page.waitForTimeout(800);
await page.mouse.click(700, 400); // unlock audio
await page.screenshot({ path: SHOTS + '01-start.png' });

// Build a starter colony next to the warehouse via the sim.
const built = await page.evaluate(() => {
  const f = window.fogbound;
  const s = f.state;
  const w = s.buildings.find((b) => b.type === 'warehouse');
  const out = [];
  for (let dx = 0; dx < 6; dx++) out.push(f.place('road', w.x + 2 + dx, w.y + 2).ok);
  out.push(f.place('road', w.x + 1, w.y + 2).ok);
  out.push(f.place('house', w.x + 2, w.y + 3).ok);
  out.push(f.place('house', w.x + 4, w.y + 3).ok);
  return { out, ctx: f.sound.ctx?.state, goals: [...s.goals] };
});
console.log('built', JSON.stringify(built));
await page.waitForTimeout(120);
await page.screenshot({ path: SHOTS + '02-popin.png' });
await page.waitForTimeout(1500);
const after = await page.evaluate(() => ({ goals: [...window.fogbound.state.goals], short: document.querySelector('.goal.short')?.textContent, done: document.querySelector('.goal-done')?.textContent }));
console.log('goals after', JSON.stringify(after));
await page.screenshot({ path: SHOTS + '03-goal-done.png' });

// Make some goods and fake an upgrade to see the effects.
await page.evaluate(() => {
  const f = window.fogbound;
  const s = f.state;
  const w = s.buildings.find((b) => b.type === 'warehouse');
  const r = f.place('woodcutter', w.x + 6, w.y + 3);
  console.log('woodcutter', JSON.stringify(r.ok ? 'ok' : r.reason));
  const h = s.buildings.find((b) => b.type === 'house');
  s.fx.push({ kind: 'upgrade', id: h.id, tier: 2 });
  s.fx.push({ kind: 'made', id: h.id, good: 'fish', amount: 2 });
  s.fx.push({ kind: 'lost', id: s.buildings.filter((b) => b.type === 'house')[1].id, count: 4 });
  f.camera.zoom = 3;
  f.camera.x = (h.x + 2) * 16; f.camera.y = (h.y + 1) * 16;
});
await page.waitForTimeout(500);
await page.screenshot({ path: SHOTS + '04-effects.png' });

// Tooltip on a goods stat.
const stat = page.locator('.goods .stat').first();
await stat.hover();
await page.waitForTimeout(500);
await page.screenshot({ path: SHOTS + '05-tooltip.png', clip: { x: 0, y: 0, width: 1400, height: 200 } });
await page.locator('.goal.short').hover();
await page.waitForTimeout(500);
await page.screenshot({ path: SHOTS + '06-goal-tip.png', clip: { x: 0, y: 0, width: 700, height: 220 } });

// Menu.
await page.mouse.move(700, 500);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const menu = await page.evaluate(() => ({ open: window.fogbound.menu.isOpen, paused: window.fogbound.ctl.paused, exp: document.querySelector('.save-string').value.slice(0, 30) }));
console.log('menu', JSON.stringify(menu));
await page.screenshot({ path: SHOTS + '07-menu.png' });
const exported = await page.evaluate(() => document.querySelector('.save-string').value);
await page.keyboard.press('Escape');
const closed = await page.evaluate(() => ({ open: window.fogbound.menu.isOpen, paused: window.fogbound.ctl.paused }));
console.log('closed', JSON.stringify(closed));

// Reload: the colony should come back.
const before = await page.evaluate(() => ({ n: window.fogbound.state.buildings.length, time: window.fogbound.state.time, seed: window.fogbound.state.seed }));
await page.reload();
await page.waitForFunction(() => window.fogbound);
const reloaded = await page.evaluate(() => ({ n: window.fogbound.state.buildings.length, time: window.fogbound.state.time, seed: window.fogbound.state.seed, url: location.search }));
console.log('before', JSON.stringify(before), 'reloaded', JSON.stringify(reloaded));

// New island, then import the exported string back.
await page.goto(BASE + '/?seed=other');
await page.waitForFunction(() => window.fogbound);
console.log('other', JSON.stringify(await page.evaluate(() => ({ n: window.fogbound.state.buildings.length, seed: window.fogbound.state.seed }))));
await page.keyboard.press('Escape');
await page.fill('textarea.save-string >> nth=1', exported);
await Promise.all([page.waitForNavigation(), page.click('text=Load it')]);
await page.waitForFunction(() => window.fogbound);
console.log('imported', JSON.stringify(await page.evaluate(() => ({ n: window.fogbound.state.buildings.length, seed: window.fogbound.state.seed, url: location.search }))));

// Bad import shows an error.
await page.keyboard.press('Escape');
await page.fill('textarea.save-string >> nth=1', 'garbage');
await page.click('text=Load it');
console.log('bad import msg', await page.textContent('.menu-msg'));
await page.keyboard.press('Escape');
await page.screenshot({ path: SHOTS + '08-imported.png' });
console.log('errors', JSON.stringify(errors));
await browser.close();
