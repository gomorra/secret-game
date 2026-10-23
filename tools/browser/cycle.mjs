// Browser playtest: Runs a Tolling (sounds, drone), opens a house panel tooltip, rings the bell and checks the save is cleared and cycle 2 starts.
// Needs `npm run build && npx vite preview --port 4173` running. Screenshots go to tools/out/shots/.
// Run: node tools/browser/cycle.mjs   (Playwright from the global install; set BASE for another URL.)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const SHOTS = new URL('../out/shots/', import.meta.url).pathname;
const BASE = process.env.BASE ?? 'http://localhost:4173';
await import('node:fs').then((fs) => fs.mkdirSync(SHOTS, { recursive: true }));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('dialog', (d) => d.accept());
await page.goto(BASE + '/?seed=bellish');
await page.waitForFunction(() => window.fogbound);
await page.mouse.click(700, 400);
// Tolling: jump to the warning and the surge.
await page.evaluate(() => { window.fogbound.state.tolling.timer = 0.3; window.fogbound.ctl.setSpeed(1); });
await page.waitForTimeout(1200);
await page.evaluate(() => { window.fogbound.state.tolling.timer = 0.3; });
await page.waitForTimeout(3000);
console.log('tolling', JSON.stringify(await page.evaluate(() => ({ phase: window.fogbound.state.tolling.phase, drone: window.fogbound.sound.drone?.level }))));
await page.screenshot({ path: SHOTS + '10-surge.png' });

// House info panel with tooltip headings.
await page.evaluate(() => {
  const f = window.fogbound, s = f.state, w = s.buildings.find((b) => b.type === 'warehouse');
  for (let dx = 0; dx < 5; dx++) f.place('road', w.x + 2 + dx, w.y + 2);
  const r = f.place('house', w.x + 2, w.y + 3);
  f.ctl.select(r.building.id);
});
await page.waitForTimeout(400);
{ const bb = await page.evaluate(() => { const r = document.querySelector('.info h3.tipped').getBoundingClientRect(); return { x: r.x, y: r.y }; }); await page.mouse.move(bb.x + 10, bb.y + 6); }
await page.waitForTimeout(500);
await page.screenshot({ path: SHOTS + '11-house-info.png' });

// Save, then ring the bell.
await page.evaluate(() => window.fogbound.save());
const before = await page.evaluate(() => ({ save: !!localStorage.getItem('fogbound.save'), legacy: localStorage.getItem('fogbound.legacy.v1') }));
await page.evaluate(() => {
  const s = window.fogbound.state;
  s.alwaysLit = true;
  s.codex['cipher-bell'] = 'read';
  const bell = s.sites.find((x) => x.kind === 'bell');
  window.fogbound.advance(0.2);
  window.fogbound.ctl.selectSite(bell.id);
});
await page.waitForTimeout(500);
await page.screenshot({ path: SHOTS + '12-bell.png' });
await page.click('text=Ring the Drowned Bell');
await page.waitForTimeout(1500);
const rung = await page.evaluate(() => ({ save: localStorage.getItem('fogbound.save'), legacy: JSON.parse(localStorage.getItem('fogbound.legacy.v1')).cycle, url: location.search }));
// The URL already points at the next island, so a reload during the finale doesn't replay this one.
if (rung.url === '?seed=bellish') throw new Error('URL still points at the rung island');
console.log('before', JSON.stringify(before), 'after ring', JSON.stringify(rung));
await page.evaluate(() => document.querySelector('.finale .wake').click());
await page.waitForFunction(() => window.fogbound && window.fogbound.state);
await page.waitForTimeout(500);
const next = await page.evaluate(() => ({ cycle: window.fogbound.state.cycle, seed: window.fogbound.state.seed, url: location.search, goals: document.querySelector('.goal.short')?.textContent }));
console.log('next', JSON.stringify(next));
if (next.url !== rung.url) throw new Error(`finale went to ${next.url}, not ${rung.url}`);
await page.screenshot({ path: SHOTS + '13-cycle2.png' });
console.log('errors', JSON.stringify(errors));
await browser.close();
