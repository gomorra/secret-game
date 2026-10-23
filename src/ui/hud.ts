import { BALANCE } from '../data/balance';
import { BUILDING_LIST, BUILDINGS, type BuildingDef } from '../data/buildings';
import { GOOD_IDS, GOODS, type GoodId } from '../data/goods';
import { TIERS, tierDef } from '../data/tiers';
import { canAfford, canDemolish, demolishAt } from '../sim/build';
import { taxPerMinute, upkeepPerMinute } from '../sim/economy';
import { buildingName, hasLuxury, houseTax, upgradeBlocker } from '../sim/population';
import { derived, populationOfTier, type Building, type BuildingStatus, type GameState } from '../sim/state';
import { SPEEDS, type Controller } from './controller';

/** Goods shown in the top bar once each tier is unlocked. Intermediate goods live in the warehouse panel. */
const TOPBAR_GOODS: GoodId[][] = [
  ['wood', 'planks', 'fish'],
  ['stone', 'bread', 'lampOil'],
  ['candles', 'books'],
];

type TabId = 'infra' | 'housing' | 'prod1' | 'prod2' | 'prod3';
const TABS: { id: TabId; label: string; tier: number }[] = [
  { id: 'infra', label: 'Roads & storage', tier: 1 },
  { id: 'housing', label: 'Housing', tier: 1 },
  { id: 'prod1', label: 'Production I', tier: 1 },
  { id: 'prod2', label: 'Production II', tier: 2 },
  { id: 'prod3', label: 'Production III', tier: 3 },
];

function tabOf(def: BuildingDef): TabId {
  if (def.category === 'production') return `prod${def.tier}` as TabId;
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

function unlockText(tier: number): string {
  const t = tierDef(tier);
  return `${t.unlockResidents} ${tierDef(tier - 1).name}`;
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

  constructor(
    root: HTMLElement,
    private state: GameState,
    private ctl: Controller,
  ) {
    root.append(this.topBar(), this.buildBar(), this.info, this.toastEl, this.banner, this.tip, this.helpLine());
    ctl.onChange(() => this.refreshControls());
    window.addEventListener('pointermove', (e) => {
      this.tip.style.left = `${e.clientX + 16}px`;
      this.tip.style.top = `${e.clientY + 18}px`;
    });
    this.syncTier();
    this.refreshControls();
  }

  private topBar(): HTMLElement {
    const bar = this.top;
    bar.append(el('span', 'title', 'Fogbound'));
    const coins = el('span', 'stat');
    coins.title = 'Coins (net income per minute)';
    coins.append(el('span', 'dot coin'), this.coins, this.net);
    bar.append(coins, this.pops, this.goodsBox);

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
      b.title = t.tier > tier ? `Unlocks at ${unlockText(t.tier)}` : '';
    }
    this.renderTools();

    if (!first) {
      const t = tierDef(tier);
      const fresh = BUILDING_LIST.filter((d) => d.tier === tier && d.playerBuildable).map((d) => d.name);
      this.showBanner(`${t.name} unlocked`, `Full, content houses will now upgrade. New: ${fresh.join(', ')}.`);
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
      const b = this.toolButton(def.glyph || '▬', '', name, locked ? `🔒 ${unlockText(def.tier)}` : costText(def), () => {
        if (locked) this.toast(`${def.name} unlocks at ${unlockText(def.tier)}.`);
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

  private showBanner(title: string, body: string): void {
    this.banner.replaceChildren(el('strong', '', title), el('span', '', body));
    this.banner.classList.add('show');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('show'), 7000);
  }

  private refreshControls(): void {
    const t = this.ctl.tool;
    if (t.kind === 'build' && tabOf(BUILDINGS[t.type]) !== this.tab) {
      this.tab = tabOf(BUILDINGS[t.type]);
      this.renderTools();
      return;
    }
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
    for (const def of BUILDING_LIST) {
      this.buildButtons.get(def.id)?.classList.toggle('unaffordable', !canAfford(s, def.id));
    }

    const hint = this.ctl.hint();
    this.tip.textContent = hint ?? '';
    this.tip.classList.toggle('hidden', !hint);

    this.updateInfo();
  }

  private updateInfo(): void {
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
      const served = [...d.services.values()].filter((set) => set.has(b.type)).length;
      rows.push(['Range', `${def.serviceRadius} tiles`]);
      rows.push(['Reaches', `${served} house${served === 1 ? '' : 's'}`]);
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
