import { BALANCE } from '../data/balance';
import { BUILDING_LIST, BUILDINGS, type BuildingDef } from '../data/buildings';
import { GOODS, type GoodId } from '../data/goods';
import { tierDef } from '../data/tiers';
import { canAfford, canDemolish, demolishAt } from '../sim/build';
import { taxPerMinute, upkeepPerMinute } from '../sim/economy';
import { derived, population, type Building, type BuildingStatus, type GameState } from '../sim/state';
import { SPEEDS, type Controller } from './controller';

const SHOWN_GOODS: GoodId[] = ['wood', 'planks', 'fish'];

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

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** The HTML overlay: resource bar, build menu, info panel, toasts. */
export class Hud {
  private coins = el('span', 'value');
  private net = el('span', 'net');
  private pop = el('span', 'value');
  private goods = new Map<GoodId, HTMLElement>();
  private speedButtons: HTMLButtonElement[] = [];
  private pauseButton = el('button', 'speed', '❚❚');
  private timeEl = el('span', 'clock');
  private buildButtons = new Map<string, HTMLButtonElement>();
  private info = el('aside', 'info hidden');
  private toastEl = el('div', 'toast');
  private tip = el('div', 'cursor-tip hidden');
  private toastTimer = 0;
  private infoKey = '';

  constructor(
    root: HTMLElement,
    private state: GameState,
    private ctl: Controller,
  ) {
    root.append(this.topBar(), this.buildBar(), this.info, this.toastEl, this.tip, this.helpLine());
    ctl.onChange(() => this.refreshControls());
    window.addEventListener('pointermove', (e) => {
      this.tip.style.left = `${e.clientX + 16}px`;
      this.tip.style.top = `${e.clientY + 18}px`;
    });
    this.refreshControls();
  }

  private topBar(): HTMLElement {
    const bar = el('header', 'topbar');
    bar.append(el('span', 'title', 'Fogbound'));

    const coins = el('span', 'stat');
    coins.title = 'Coins (net income per minute)';
    coins.append(el('span', 'dot coin'), this.coins, this.net);
    const pop = el('span', 'stat');
    pop.title = 'Population';
    pop.append(el('span', 'icon', '☗'), this.pop);
    bar.append(coins, pop);

    for (const g of SHOWN_GOODS) {
      const s = el('span', 'stat');
      s.title = GOODS[g].name;
      const dot = el('span', 'dot');
      dot.style.background = hex(GOODS[g].color);
      const v = el('span', 'value');
      s.append(dot, el('span', 'label', GOODS[g].name), v);
      this.goods.set(g, v);
      bar.append(s);
    }

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

  private buildBar(): HTMLElement {
    const bar = el('nav', 'buildbar');
    const select = el('button', 'tool');
    select.append(el('span', 'swatch select', '↖'), el('span', 'name', 'Select'), el('span', 'cost', 'Esc'));
    select.onclick = () => this.ctl.setTool({ kind: 'select' });
    this.buildButtons.set('select', select);
    bar.append(select);

    for (const def of BUILDING_LIST) {
      if (!def.playerBuildable) continue;
      const b = el('button', 'tool');
      const sw = el('span', 'swatch', def.glyph || '▬');
      sw.style.background = hex(def.color);
      b.append(sw, el('span', 'name', def.name + (def.hotkey ? ` (${def.hotkey.toUpperCase()})` : '')), el('span', 'cost', costText(def)));
      const lines = [def.description, `Cost: ${costText(def)}`];
      if (def.upkeep) lines.push(`Upkeep: ${def.upkeep} coins/min`);
      if (def.production) {
        const p = def.production;
        const inputs = Object.entries(p.inputs).map(([g, n]) => `${n} ${GOODS[g as GoodId].name.toLowerCase()}`);
        lines.push(`Makes ${p.amount} ${GOODS[p.output].name.toLowerCase()} every ${p.cycle}s${inputs.length ? ` from ${inputs.join(', ')}` : ''}`);
      }
      b.title = lines.join('\n');
      b.onclick = () => this.ctl.setTool({ kind: 'build', type: def.id });
      this.buildButtons.set(def.id, b);
      bar.append(b);
    }

    const demolish = el('button', 'tool');
    demolish.append(el('span', 'swatch demolish', '✕'), el('span', 'name', 'Demolish (X)'), el('span', 'cost', `${BALANCE.demolishRefund * 100}% refund`));
    demolish.title = 'Click or drag to remove buildings and roads. Refunds half the materials.';
    demolish.onclick = () => this.ctl.setTool({ kind: 'demolish' });
    this.buildButtons.set('demolish', demolish);
    bar.append(demolish);
    return bar;
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
    const cap = derived(s).storageCap;
    this.coins.textContent = Math.floor(s.coins).toLocaleString();
    const net = taxPerMinute(s) - upkeepPerMinute(s);
    this.net.textContent = `${net >= 0 ? '+' : ''}${Math.round(net)}/min`;
    this.net.classList.toggle('neg', net < 0);
    this.pop.textContent = String(population(s));
    for (const [g, v] of this.goods) {
      const n = Math.floor(s.goods[g]);
      v.textContent = `${n}/${cap}`;
      v.classList.toggle('empty', n <= 0);
      v.classList.toggle('full', n >= cap);
    }
    this.timeEl.textContent = clock(s.time);
    for (const def of BUILDING_LIST) {
      const b = this.buildButtons.get(def.id);
      b?.classList.toggle('unaffordable', !canAfford(s, def.id));
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
    const key = `${b.id}|${b.status}|${b.residents}|${Math.round((b.progress ?? 0) * 20)}|${JSON.stringify(b.supply)}`;
    if (key === this.infoKey) return;
    this.infoKey = key;
    this.renderInfo(b);
  }

  private renderInfo(b: Building): void {
    const def = BUILDINGS[b.type];
    const d = derived(this.state);
    const box = this.info;
    box.replaceChildren();
    const close = el('button', 'close', '×');
    close.onclick = () => this.ctl.select(null);
    box.append(close, el('h2', '', def.name), el('p', 'desc', def.description));

    const status = el('p', `status ${b.status}`, STATUS_TEXT[b.status]);
    if (b.type !== 'warehouse' && b.type !== 'lantern') box.append(status);

    const rows: [string, string][] = [];
    if (def.production) {
      const p = def.production;
      rows.push(['Produces', `${p.amount} ${GOODS[p.output].name} / ${p.cycle}s`]);
      const inputs = Object.entries(p.inputs);
      if (inputs.length) rows.push(['Uses', inputs.map(([g, n]) => `${n} ${GOODS[g as GoodId].name}`).join(', ')]);
      if (def.resource) rows.push(['Efficiency', `${Math.round((d.efficiency.get(b.id) ?? 0) * 100)}% (${def.resource.label})`]);
      if (b.active) rows.push(['Progress', `${Math.floor((b.progress ?? 0) * 100)}%`]);
    }
    if (b.type === 'warehouse') rows.push(['Storage', `${def.storage} per good`]);
    if (def.upkeep) rows.push(['Upkeep', `${def.upkeep} coins/min`]);
    if (b.type === 'house') {
      const tier = tierDef(b.tier ?? 1);
      rows.push(['Residents', `${b.residents ?? 0} / ${tier.maxResidents} ${tier.name}`]);
      rows.push(['Tax', b.status === 'ok' ? `${((b.residents ?? 0) * tier.tax).toFixed(1)} coins/min` : 'None']);
    }
    const table = el('dl');
    for (const [k, v] of rows) table.append(el('dt', '', k), el('dd', '', v));
    box.append(table);

    if (b.type === 'house') {
      const tier = tierDef(b.tier ?? 1);
      const needs = el('div', 'needs');
      needs.append(el('h3', '', 'Needs'));
      for (const n of tier.needs) {
        const v = b.supply?.[n.good] ?? 1;
        const row = el('div', 'need');
        const bar = el('span', 'bar');
        const fill = el('span', 'fill');
        fill.style.width = `${Math.round(v * 100)}%`;
        fill.classList.toggle('low', v < BALANCE.needMetThreshold);
        bar.append(fill);
        row.append(el('span', 'label', GOODS[n.good].name), bar);
        needs.append(row);
      }
      box.append(needs);
    }

    if (canDemolish(this.state, b).ok) {
      const btn = el('button', 'danger', 'Demolish');
      btn.onclick = () => {
        const res = demolishAt(this.state, b.x, b.y);
        if (res.ok) this.ctl.select(null);
        else this.toast(res.reason);
      };
      box.append(btn);
    }
  }
}
