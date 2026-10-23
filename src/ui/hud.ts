import { BALANCE } from '../data/balance';
import { BUILDING_LIST, BUILDINGS, type BuildingDef } from '../data/buildings';
import { GOOD_IDS, GOODS, type GoodId } from '../data/goods';
import { TIERS, tierDef } from '../data/tiers';
import { canAfford, canDemolish, demolishAt } from '../sim/build';
import { taxPerMinute, upkeepPerMinute } from '../sim/economy';
import { lightRadius } from '../sim/fog';
import { answerStone, bellBlocker, codexProgress, ringBell, ruinLoot, siteName, type GameEvent, type Site } from '../sim/lore';
import { buildingName, dreadRate, hasLuxury, houseTax, servedBy, unlockThreshold, upgradeBlocker } from '../sim/population';
import { RELICS } from '../data/relics';
import { Codex, romanNumeral } from './codex';
import { derived, populationOfTier, type Building, type BuildingStatus, type GameState } from '../sim/state';
import { SPEEDS, type Controller } from './controller';

/** Goods shown in the top bar once each tier is unlocked. Intermediate goods live in the warehouse panel. */
const TOPBAR_GOODS: GoodId[][] = [
  ['wood', 'planks', 'fish'],
  ['stone', 'bread', 'lampOil'],
  ['candles', 'books'],
];

type TabId = 'infra' | 'light' | 'housing' | 'prod1' | 'prod2' | 'prod3';
const TABS: { id: TabId; label: string; tier: number }[] = [
  { id: 'infra', label: 'Roads & storage', tier: 1 },
  { id: 'light', label: 'Lights', tier: 1 },
  { id: 'housing', label: 'Housing', tier: 1 },
  { id: 'prod1', label: 'Production I', tier: 1 },
  { id: 'prod2', label: 'Production II', tier: 2 },
  { id: 'prod3', label: 'Production III', tier: 3 },
];

function tabOf(def: BuildingDef): TabId {
  if (def.category === 'production') return `prod${def.tier}` as TabId;
  if (def.category === 'light') return 'light';
  return def.category === 'housing' ? 'housing' : 'infra';
}

const STATUS_TEXT: Record<BuildingStatus, string> = {
  ok: 'Content',
  working: 'Working',
  unconnected: 'No road to a warehouse',
  noInput: 'Waiting for input goods',
  storageFull: 'Warehouse is full',
  noResource: 'Nothing nearby to harvest',
  needsUnmet: 'Needs not met: paying no tax',
  dark: 'In the dark: stopped',
  noFuel: 'Out of fuel: the fog is creeping back',
  abandoned: 'Empty. The door stands open.',
};

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function costText(def: BuildingDef): string {
  const parts: string[] = [];
  if (def.cost.coins) parts.push(`${def.cost.coins} coins`);
  for (const [g, n] of Object.entries(def.cost.goods)) parts.push(`${n} ${GOODS[g as GoodId].name.toLowerCase()}`);
  return parts.join(', ') || 'Free';
}

function unlockText(state: GameState, tier: number): string {
  return `${unlockThreshold(state, tier)} ${tierDef(tier - 1).name}`;
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** The HTML overlay: resource bar, build menu, info panel, toasts. */
export class Hud {
  private top = el('header', 'topbar');
  private coins = el('span', 'value');
  private net = el('span', 'net');
  private pops = el('span', 'pops');
  private goodsBox = el('span', 'goods');
  private goods = new Map<GoodId, HTMLElement>();
  private speedButtons: HTMLButtonElement[] = [];
  private pauseButton = el('button', 'speed', '❚❚');
  private timeEl = el('span', 'clock');
  private tabButtons = new Map<TabId, HTMLButtonElement>();
  private toolRow = el('div', 'tools');
  private buildButtons = new Map<string, HTMLButtonElement>();
  private tab: TabId = 'infra';
  private info = el('aside', 'info hidden');
  private toastEl = el('div', 'toast');
  private banner = el('div', 'banner');
  private tip = el('div', 'cursor-tip hidden');
  private toastTimer = 0;
  private bannerTimer = 0;
  private infoKey = '';
  private shownTier = 0;
  private bell = el('div', 'bell hidden');
  private bellText = el('span', 'bell-text');
  private fuelToggle = el('button', 'fuel-toggle');
  private lostEl = el('span', 'stat lost hidden');
  private lastPhase = '';
  private lastTool = 'select';
  private lastLost = 0;
  private codex: Codex;
  private codexButton = el('button', 'codex-button');
  private whisperEl = el('div', 'whisper');
  private whisperTimer = 0;
  private bannerQueue: { title: string; body: string; kind: string }[] = [];
  private bannerBusy = false;

  constructor(
    root: HTMLElement,
    private state: GameState,
    private ctl: Controller,
    /** Called when the player rings the Drowned Bell. */
    private onRing: () => void,
    onForget: () => void,
  ) {
    root.append(this.topBar(), this.bellWidget(), this.buildBar(), this.info, this.toastEl, this.banner, this.whisperEl, this.tip, this.helpLine());
    this.codex = new Codex(root, state, onForget);
    ctl.onCodex = () => this.codex.toggle();
    if (state.cycle > 1) {
      this.showBanner(
        `Cycle ${romanNumeral(state.cycle)}`,
        'You wake on a cold shore with a lantern in your hand. You remember more than you should. The fog remembers you.',
        'cycle',
      );
    }
    this.lastPhase = state.tolling.phase;
    this.lastLost = state.lost;
    ctl.onChange(() => this.onControllerChange());
    window.addEventListener('pointermove', (e) => {
      this.tip.style.left = `${e.clientX + 16}px`;
      this.tip.style.top = `${e.clientY + 18}px`;
    });
    this.syncTier();
    this.refreshControls();
  }

  private topBar(): HTMLElement {
    const bar = this.top;
    const title = el('span', 'title', 'Fogbound');
    if (this.state.cycle > 1) title.append(el('small', 'cycle', ` · Cycle ${romanNumeral(this.state.cycle)}`));
    bar.append(title);
    const coins = el('span', 'stat');
    coins.title = 'Coins (net income per minute)';
    coins.append(el('span', 'dot coin'), this.coins, this.net);
    this.lostEl.title = 'Residents who walked into the fog';
    this.codexButton.title = 'Codex: lore pages and relics (C)';
    this.codexButton.onclick = () => this.codex.toggle();
    bar.append(coins, this.pops, this.lostEl, this.goodsBox, this.codexButton);

    const speeds = el('span', 'speeds');
    this.pauseButton.title = 'Pause (Space)';
    this.pauseButton.onclick = () => this.ctl.togglePause();
    speeds.append(this.pauseButton);
    SPEEDS.forEach((s, i) => {
      const b = el('button', 'speed', `${s}×`);
      b.title = `Speed ${s}× (${i + 1})`;
      b.onclick = () => this.ctl.setSpeed(s);
      this.speedButtons.push(b);
      speeds.append(b);
    });
    speeds.append(this.timeEl);
    bar.append(speeds);
    return bar;
  }

  /** Rebuild the parts of the HUD that grow as tiers unlock. */
  private syncTier(): void {
    const tier = this.state.unlockedTier;
    if (tier === this.shownTier) return;
    const first = this.shownTier === 0;
    this.shownTier = tier;

    this.goodsBox.replaceChildren();
    this.goods.clear();
    for (const g of TOPBAR_GOODS.slice(0, tier).flat()) {
      const s = el('span', 'stat');
      s.title = GOODS[g].name;
      const dot = el('span', 'dot');
      dot.style.background = hex(GOODS[g].color);
      const v = el('span', 'value');
      s.append(dot, el('span', 'label', GOODS[g].name), v);
      this.goods.set(g, v);
      this.goodsBox.append(s);
    }

    for (const t of TABS) {
      const b = this.tabButtons.get(t.id)!;
      b.classList.toggle('locked', t.tier > tier);
      b.title = t.tier > tier ? `Unlocks at ${unlockText(this.state, t.tier)}` : '';
    }
    this.renderTools();

    if (!first) {
      const t = tierDef(tier);
      const fresh = BUILDING_LIST.filter((d) => d.tier === tier && d.playerBuildable).map((d) => d.name);
      this.showBanner(`${t.name} unlocked`, `Full, content houses will now upgrade. New: ${fresh.join(', ')}.`);
    }
  }

  /** Countdown to the next Tolling, and the choice to burn double fuel through it. */
  private bellWidget(): HTMLElement {
    this.fuelToggle.onclick = () => {
      this.state.doubleFuel = !this.state.doubleFuel;
      this.updateBell();
    };
    this.fuelToggle.title = 'Lights burn twice the fuel during a surge, but keep their full size. The Last Lantern always shrinks.';
    this.bell.append(this.bellText, this.fuelToggle);
    return this.bell;
  }

  private updateBell(): void {
    const t = this.state.tolling;
    const secs = clock(Math.max(0, t.timer));
    this.bell.classList.remove('hidden');
    this.bell.classList.toggle('warning', t.phase === 'warning');
    this.bell.classList.toggle('surge', t.phase === 'surge');
    this.bellText.textContent =
      t.phase === 'calm' ? `Next tolling in ${secs}` : t.phase === 'warning' ? `The bell tolls · surge in ${secs}` : `The fog surges · ${secs}`;
    this.fuelToggle.textContent = `Double fuel: ${this.state.doubleFuel ? 'on' : 'off'}`;
    this.fuelToggle.classList.toggle('on', this.state.doubleFuel);
    document.body.classList.toggle('surging', t.strength > 0.05);

    if (t.phase !== this.lastPhase) {
      if (t.phase === 'warning') {
        this.showBanner('A bell tolls beneath the sea', 'In one minute the fog will surge and every light will shrink. Stock fuel, or burn double.');
      } else if (t.phase === 'surge') {
        this.showBanner('The fog surges', 'Hold on. It passes in a minute.');
      } else if (this.lastPhase === 'surge') {
        this.showBanner('The fog draws back', 'The bell is quiet. For now.');
      }
      this.lastPhase = t.phase;
    }
  }

  private buildBar(): HTMLElement {
    const bar = el('nav', 'buildbar');
    const tabs = el('div', 'tabs');
    for (const t of TABS) {
      const b = el('button', 'tab', t.label);
      b.onclick = () => {
        this.tab = t.id;
        this.renderTools();
      };
      this.tabButtons.set(t.id, b);
      tabs.append(b);
    }
    bar.append(tabs, this.toolRow);
    return bar;
  }

  private toolButton(swatchText: string, swatchClass: string, name: string, sub: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'tool');
    b.append(el('span', `swatch ${swatchClass}`, swatchText), el('span', 'name', name), el('span', 'cost', sub));
    b.onclick = onClick;
    return b;
  }

  private renderTools(): void {
    this.toolRow.replaceChildren();
    this.buildButtons.clear();
    for (const [id, b] of this.tabButtons) b.classList.toggle('active', id === this.tab);

    const select = this.toolButton('↖', 'select', 'Select', 'Esc', () => this.ctl.setTool({ kind: 'select' }));
    this.buildButtons.set('select', select);
    this.toolRow.append(select);

    for (const def of BUILDING_LIST) {
      if (!def.playerBuildable || tabOf(def) !== this.tab) continue;
      const locked = def.tier > this.state.unlockedTier;
      const name = def.name + (def.hotkey ? ` (${def.hotkey.toUpperCase()})` : '');
      const b = this.toolButton(def.glyph || '▬', '', name, locked ? `🔒 ${unlockText(this.state, def.tier)}` : costText(def), () => {
        if (locked) this.toast(`${def.name} unlocks at ${unlockText(this.state, def.tier)}.`);
        else this.ctl.setTool({ kind: 'build', type: def.id });
      });
      (b.firstChild as HTMLElement).style.background = hex(def.color);
      b.classList.toggle('locked', locked);
      b.title = this.tooltip(def);
      this.buildButtons.set(def.id, b);
      this.toolRow.append(b);
    }

    const demolish = this.toolButton('✕', 'demolish', 'Demolish (X)', `${BALANCE.demolishRefund * 100}% refund`, () =>
      this.ctl.setTool({ kind: 'demolish' }),
    );
    demolish.title = 'Click or drag to remove buildings and roads. Refunds half the materials.';
    this.buildButtons.set('demolish', demolish);
    this.toolRow.append(demolish);
    this.refreshControls();
  }

  private tooltip(def: BuildingDef): string {
    const lines = [def.description, `Cost: ${costText(def)}`];
    if (def.upkeep) lines.push(`Upkeep: ${def.upkeep} coins/min`);
    if (def.production) {
      const p = def.production;
      const inputs = Object.entries(p.inputs).map(([g, n]) => `${n} ${GOODS[g as GoodId].name.toLowerCase()}`);
      lines.push(`Makes ${p.amount} ${GOODS[p.output].name.toLowerCase()} every ${p.cycle}s${inputs.length ? ` from ${inputs.join(', ')}` : ''}`);
    }
    if (def.serviceRadius) lines.push(`Reaches houses within ${def.serviceRadius} tiles`);
    return lines.join('\n');
  }

  private helpLine(): HTMLElement {
    return el('div', 'help', 'Drag or WASD to pan · Wheel to zoom · Right-click or Esc to cancel · Space to pause');
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2200);
  }

  /** Banners queue up so a burst of discoveries doesn't flash past unread. */
  private showBanner(title: string, body: string, kind = ''): void {
    this.bannerQueue.push({ title, body, kind });
    if (this.bannerQueue.length > 4) this.bannerQueue.shift();
    if (!this.bannerBusy) this.nextBanner();
  }

  private nextBanner(): void {
    const next = this.bannerQueue.shift();
    if (!next) {
      this.bannerBusy = false;
      return;
    }
    this.bannerBusy = true;
    this.banner.className = `banner ${next.kind}`;
    this.banner.replaceChildren(el('strong', '', next.title), el('span', '', next.body));
    requestAnimationFrame(() => this.banner.classList.add('show'));
    window.clearTimeout(this.bannerTimer);
    const ms = this.bannerQueue.length ? 3500 : 6500;
    this.bannerTimer = window.setTimeout(() => {
      this.banner.classList.remove('show');
      window.setTimeout(() => this.nextBanner(), 450);
    }, ms);
  }

  private whisper(text: string): void {
    this.whisperEl.textContent = text;
    this.whisperEl.classList.add('show');
    window.clearTimeout(this.whisperTimer);
    this.whisperTimer = window.setTimeout(() => this.whisperEl.classList.remove('show'), 7000);
  }

  private handleEvents(): void {
    for (const e of this.state.events.splice(0)) this.handleEvent(e);
  }

  private handleEvent(e: GameEvent): void {
    if (e.kind === 'whisper' && !e.title) {
      this.whisper(e.text);
      return;
    }
    this.showBanner(e.title, e.text, e.kind);
  }

  /** When a tool is picked (e.g. by hotkey), show the tab it lives on. */
  private onControllerChange(): void {
    const t = this.ctl.tool;
    const toolKey = t.kind === 'build' ? t.type : t.kind;
    if (toolKey !== this.lastTool) {
      this.lastTool = toolKey;
      if (t.kind === 'build' && tabOf(BUILDINGS[t.type]) !== this.tab) {
        this.tab = tabOf(BUILDINGS[t.type]);
        this.renderTools();
        return;
      }
    }
    this.refreshControls();
  }

  private refreshControls(): void {
    const t = this.ctl.tool;
    const active = t.kind === 'build' ? t.type : t.kind;
    for (const [id, b] of this.buildButtons) b.classList.toggle('active', id === active);
    this.pauseButton.classList.toggle('active', this.ctl.paused);
    this.speedButtons.forEach((b, i) => b.classList.toggle('active', !this.ctl.paused && this.ctl.speed === SPEEDS[i]));
    this.infoKey = '';
  }

  /** Refresh numbers. Cheap enough to call a few times a second. */
  update(): void {
    const s = this.state;
    this.syncTier();
    const cap = derived(s).storageCap;
    this.coins.textContent = Math.floor(s.coins).toLocaleString();
    const net = taxPerMinute(s) - upkeepPerMinute(s);
    this.net.textContent = `${net >= 0 ? '+' : ''}${Math.round(net)}/min`;
    this.net.classList.toggle('neg', net < 0);

    this.pops.replaceChildren();
    for (const t of TIERS.slice(0, s.unlockedTier)) {
      const p = el('span', 'stat');
      p.title = t.name;
      const icon = el('span', 'icon', '☗');
      icon.style.color = hex(t.color);
      p.append(icon, el('span', 'value', String(populationOfTier(s, t.id))));
      this.pops.append(p);
    }

    for (const [g, v] of this.goods) {
      const n = Math.floor(s.goods[g]);
      v.textContent = String(n);
      v.parentElement!.title = `${GOODS[g].name}: ${n} / ${cap}`;
      v.classList.toggle('empty', n <= 0);
      v.classList.toggle('full', n >= cap);
    }
    this.timeEl.textContent = clock(s.time);
    this.updateBell();
    this.handleEvents();
    const prog = codexProgress(s);
    this.codexButton.textContent = `Codex ${prog.read}/${prog.total}${s.relics.length ? ` · ${s.relics.length} relic${s.relics.length === 1 ? '' : 's'}` : ''}`;
    this.lostEl.classList.toggle('hidden', s.lost === 0);
    this.lostEl.textContent = `☽ ${s.lost} lost`;
    if (s.lost > this.lastLost) {
      const n = s.lost - this.lastLost;
      this.showBanner(
        n === 1 ? 'Someone walked into the fog' : `${n} people walked into the fog`,
        'Their house stands empty, the door left open. Keep your people lit, fed, and near a shrine.',
      );
      this.lastLost = s.lost;
    }
    for (const def of BUILDING_LIST) {
      this.buildButtons.get(def.id)?.classList.toggle('unaffordable', !canAfford(s, def.id));
    }

    const hint = this.ctl.hint();
    this.tip.textContent = hint ?? '';
    this.tip.classList.toggle('hidden', !hint);

    this.updateInfo();
  }

  private updateInfo(): void {
    const site = this.ctl.selectedSiteId ? this.state.sites.find((o) => o.id === this.ctl.selectedSiteId) : undefined;
    if (site) {
      this.info.classList.remove('hidden');
      const key = ['site', site.id, site.found, site.choice, this.state.rev, bellBlocker(this.state)].join('|');
      if (key !== this.infoKey) {
        this.infoKey = key;
        this.renderSite(site);
      }
      return;
    }
    const b = this.ctl.selectedId ? this.state.buildings.find((o) => o.id === this.ctl.selectedId) : undefined;
    if (!b) {
      this.info.classList.add('hidden');
      return;
    }
    this.info.classList.remove('hidden');
    const key = [
      b.id,
      b.status,
      b.tier,
      b.residents,
      Math.round((b.progress ?? 0) * 20),
      Math.round(b.content ?? 0),
      Math.round(b.dread ?? 0),
      Math.round((b.intensity ?? 0) * 20),
      Math.round(b.emptyFor ?? 0),
      JSON.stringify(b.supply),
      b.type === 'warehouse' || b.type === 'house' ? JSON.stringify(this.state.goods) : '',
      this.state.rev,
    ].join('|');
    if (key === this.infoKey) return;
    this.infoKey = key;
    this.renderInfo(b);
  }

  private renderInfo(b: Building): void {
    const s = this.state;
    const def = BUILDINGS[b.type];
    const d = derived(s);
    const box = this.info;
    box.replaceChildren();
    const close = el('button', 'close', '×');
    close.onclick = () => this.ctl.select(null);
    box.append(close, el('h2', '', buildingName(b)), el('p', 'desc', def.description));

    if (b.type !== 'warehouse' && b.type !== 'lantern') box.append(el('p', `status ${b.status}`, STATUS_TEXT[b.status]));

    const rows: [string, string][] = [];
    if (def.production) {
      const p = def.production;
      rows.push(['Produces', `${p.amount} ${GOODS[p.output].name} / ${p.cycle}s`]);
      const inputs = Object.entries(p.inputs);
      if (inputs.length) rows.push(['Uses', inputs.map(([g, n]) => `${n} ${GOODS[g as GoodId].name}`).join(', ')]);
      if (def.resource) rows.push(['Efficiency', `${Math.round((d.efficiency.get(b.id) ?? 0) * 100)}% (${def.resource.label})`]);
      if (b.active) rows.push(['Progress', `${Math.floor((b.progress ?? 0) * 100)}%`]);
    }
    if (def.serviceRadius) {
      const served = [...d.services.values()].filter((ids) => ids.includes(b.id)).length;
      rows.push(['Range', `${def.serviceRadius} tiles`]);
      rows.push(['Reaches', `${served} house${served === 1 ? '' : 's'}`]);
    }
    if (def.light) {
      rows.push(['Light', `${lightRadius(s, b).toFixed(1)} / ${def.light.radius} tiles`]);
      if (def.light.fuel) {
        const name = GOODS[def.light.fuel].name.toLowerCase();
        rows.push(['Burns', `${def.light.burn} ${name}/min${s.doubleFuel ? ` (×2 in a surge)` : ''}`]);
      } else rows.push(['Burns', 'Nothing. It never goes out.']);
    }
    if (def.upkeep) rows.push(['Upkeep', `${def.upkeep} coins/min`]);
    if (b.type === 'house') {
      const tier = tierDef(b.tier ?? 1);
      rows.push(['Residents', `${b.residents ?? 0} / ${tier.maxResidents} ${tier.name}`]);
      const tax = houseTax(s, b);
      rows.push(['Tax', tax > 0 ? `${tax.toFixed(1)} coins/min` : 'None']);
    }
    const table = el('dl');
    for (const [k, v] of rows) table.append(el('dt', '', k), el('dd', '', v));
    box.append(table);

    if (b.type === 'house') this.houseDetails(box, b);
    if (b.type === 'warehouse') this.inventory(box);

    if (canDemolish(s, b).ok) {
      const btn = el('button', 'danger', 'Demolish');
      btn.onclick = () => {
        const res = demolishAt(s, b.x, b.y);
        if (res.ok) this.ctl.select(null);
        else this.toast(res.reason);
      };
      box.append(btn);
    }
  }

  private renderSite(site: Site): void {
    const s = this.state;
    const box = this.info;
    box.replaceChildren();
    const close = el('button', 'close', '×');
    close.onclick = () => this.ctl.selectSite(null);
    box.append(close, el('h2', '', siteName(site)));

    if (!site.found && site.kind !== 'bell') {
      box.append(el('p', 'desc', 'Something waits here in the fog. Bring light to this spot to find out what.'));
      return;
    }
    switch (site.kind) {
      case 'ruin': {
        const loot = ruinLoot(s, site);
        const goods = Object.entries(loot.goods).map(([g, n]) => `${n} ${GOODS[g as GoodId].name.toLowerCase()}`);
        box.append(el('p', 'desc', `Picked clean. You salvaged ${loot.coins} coins, ${goods.join(', ')}.`));
        break;
      }
      case 'journal':
        box.append(el('p', 'desc', 'A satchel, empty now. Its pages are in your codex.'));
        break;
      case 'relic':
        if (site.relic) {
          const r = RELICS[site.relic];
          box.append(el('p', 'desc', r.flavour), el('p', 'status working', r.effect));
        }
        break;
      case 'stone': {
        if (!site.choice) {
          box.append(
            el('p', 'desc', '“Feed us your fear and we will make your hands quick. Everything you make, you will make faster. Your people will not sleep so well.”'),
            el('p', 'status needsUnmet', `+${BALANCE.pactProduction * 100}% production everywhere · dread +${BALANCE.pactDread}/min in every house`),
          );
          const yes = el('button', 'choice accept', 'Accept the bargain');
          yes.onclick = () => answerStone(s, site.id, true);
          const no = el('button', 'choice', 'Turn away');
          no.onclick = () => answerStone(s, site.id, false);
          box.append(yes, no);
        } else {
          box.append(el('p', 'desc', site.choice === 'accepted' ? 'It hums, pleased. Your workshops run faster. Your people dream of the sea.' : 'It has gone quiet. It will not ask again.'));
        }
        break;
      }
      case 'bell': {
        box.append(
          el(
            'p',
            'desc',
            site.found
              ? 'Green bronze, taller than a house, hanging from the ribs of a drowned chapel. The rope is new.'
              : 'Far off on the shore, half in the sea, something huge and bell-shaped. The journals lead here.',
          ),
        );
        const blocker = bellBlocker(s);
        if (blocker) box.append(el('p', 'upgrade', blocker));
        else {
          box.append(el('p', 'status needsUnmet', 'Ringing it ends this cycle. You keep your relics and your codex. Everything else is lost.'));
          const ring = el('button', 'choice ring', 'Ring the Drowned Bell');
          ring.onclick = () => {
            if (confirm('Ring the bell? The fog will take this island and everything on it.') && ringBell(s)) this.onRing();
          };
          box.append(ring);
        }
        break;
      }
    }
  }

  private houseDetails(box: HTMLElement, b: Building): void {
    const s = this.state;
    const tier = tierDef(b.tier ?? 1);
    box.append(el('h3', '', 'Needs'));
    for (const n of tier.needs) {
      const v = b.supply?.[n.good] ?? 1;
      const row = el('div', 'need');
      const bar = el('span', 'bar');
      const fill = el('span', 'fill');
      fill.style.width = `${Math.round(v * 100)}%`;
      fill.classList.toggle('low', v < BALANCE.needMetThreshold);
      bar.append(fill);
      row.append(el('span', 'label', GOODS[n.good].name), bar);
      box.append(row);
    }
    box.append(el('h3', '', 'Dread'));
    const dread = b.dread ?? 0;
    const rate = dreadRate(s, b);
    const row = el('div', 'need dread');
    const bar = el('span', 'bar');
    const fill = el('span', 'fill');
    fill.style.width = `${Math.round(dread)}%`;
    bar.append(fill);
    row.append(el('span', 'label', `${Math.round(dread)}%`), bar);
    box.append(row);
    const why: string[] = [];
    if (b.status === 'dark') why.push('in the dark');
    if (b.status === 'needsUnmet') why.push('needs unmet');
    if (s.tolling.phase === 'surge') why.push('the fog surges');
    if (servedBy(s, b, 'shrine')) why.push('a shrine calms them');
    const trend = rate > 0 ? `Rising${why.length ? `: ${why.join(', ')}` : ''}` : rate < 0 ? `Easing${why.length ? `: ${why.join(', ')}` : ''}` : 'Steady';
    box.append(el('p', `dread-note ${rate > 0 ? 'up' : ''}`, trend));
    if ((b.emptyFor ?? 0) > 0) box.append(el('p', 'dread-note up', `Empty for another ${Math.ceil(b.emptyFor ?? 0)}s.`));

    const lux = BUILDINGS[tier.luxury];
    const has = hasLuxury(s, b);
    box.append(
      el('p', `luxury ${has ? 'yes' : 'no'}`, `${has ? '✓' : '✗'} ${lux.name} nearby (+${BALANCE.luxuryTaxBonus * 100}% tax)`),
    );

    box.append(el('h3', '', 'Upgrade'));
    const blocker = upgradeBlocker(s, b);
    if (blocker) box.append(el('p', 'upgrade', blocker));
    else {
      const left = Math.max(0, Math.ceil(BALANCE.upgradeDelay - (b.content ?? 0)));
      box.append(el('p', 'upgrade ready', `Becoming ${tierDef((b.tier ?? 1) + 1).name} in ${left}s`));
    }
  }

  private inventory(box: HTMLElement): void {
    const s = this.state;
    const cap = derived(s).storageCap;
    box.append(el('h3', '', 'In storage'));
    const list = el('div', 'inventory');
    for (const g of GOOD_IDS) {
      const n = Math.floor(s.goods[g]);
      if (n <= 0) continue;
      const row = el('span', 'stat');
      const dot = el('span', 'dot');
      dot.style.background = hex(GOODS[g].color);
      row.append(dot, el('span', 'label', GOODS[g].name), el('span', 'value', `${n}/${cap}`));
      list.append(row);
    }
    if (!list.children.length) list.append(el('span', 'label', 'Empty'));
    box.append(list);
  }
}
