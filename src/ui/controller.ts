import { BUILDING_LIST, BUILDINGS, type BuildingId } from '../data/buildings';
import { TILE } from '../render/palette';
import type { Camera } from '../render/camera';
import type { Overlay } from '../render/world';
import { canDemolish, canPlace, demolishAt, lPath, placeBuilding } from '../sim/build';
import { siteAt, siteName, type Site } from '../sim/lore';
import { buildingAt, type GameState } from '../sim/state';

export type Tool = { kind: 'select' } | { kind: 'build'; type: BuildingId } | { kind: 'demolish' };

export const SPEEDS = [1, 2, 4] as const;

const PAN_SPEED = 600; // screen px per second

/** Turns mouse and keyboard input into camera moves and sim commands. */
export class Controller {
  tool: Tool = { kind: 'select' };
  selectedId: number | null = null;
  selectedSiteId: number | null = null;
  paused = false;
  speed: number = 1;

  private mouse = { x: 0, y: 0, inside: false };
  private hoverTile: { x: number; y: number } | null = null;
  private dragStart: { x: number; y: number } | null = null;
  private pan: { x: number; y: number; moved: number; button: number } | null = null;
  private keys = new Set<string>();
  private listeners: (() => void)[] = [];
  /** Set by the HUD: open or close the codex. */
  onCodex: (() => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: Camera,
    private state: GameState,
    private toast: (msg: string) => void,
  ) {
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointerleave', () => (this.mouse.inside = false));
    canvas.addEventListener('pointerenter', () => (this.mouse.inside = true));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Called when the tool, selection or speed changes, so the HUD can refresh. */
  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.dragStart = null;
    if (tool.kind !== 'select') this.selectedId = null;
    this.changed();
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.paused = false;
    this.changed();
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.changed();
  }

  select(id: number | null): void {
    this.selectedId = id;
    this.selectedSiteId = null;
    this.changed();
  }

  selectSite(id: number | null): void {
    this.selectedSiteId = id;
    this.selectedId = null;
    this.changed();
  }

  /** An explored secret on this tile, if any. */
  private siteOn(x: number, y: number): Site | undefined {
    const s = this.state;
    if (x < 0 || y < 0 || x >= s.map.width || y >= s.map.height || !s.explored[y * s.map.width + x]) return undefined;
    return siteAt(s, x, y);
  }

  /** Per-frame work: keyboard panning and hover tracking. */
  frame(dt: number): void {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx += 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx -= 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy -= 1;
    if (dx || dy) this.camera.panBy(dx * PAN_SPEED * dt, dy * PAN_SPEED * dt);
    this.updateHover();
  }

  private size(): { w: number; h: number } {
    return { w: this.canvas.clientWidth, h: this.canvas.clientHeight };
  }

  private worldAt(sx: number, sy: number): { x: number; y: number } {
    const { w, h } = this.size();
    return this.camera.screenToWorld(sx, sy, w, h);
  }

  private updateHover(): void {
    if (!this.mouse.inside) {
      this.hoverTile = null;
      return;
    }
    const p = this.worldAt(this.mouse.x, this.mouse.y);
    this.hoverTile = { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
  }

  /** Top-left tile for a building of `type` centred under the cursor. */
  private anchorFor(type: BuildingId): { x: number; y: number } | null {
    if (!this.mouse.inside) return null;
    const [w, h] = BUILDINGS[type].size;
    const p = this.worldAt(this.mouse.x, this.mouse.y);
    return { x: Math.round(p.x / TILE - w / 2), y: Math.round(p.y / TILE - h / 2) };
  }

  /** Message for the cursor tooltip, if any. */
  hint(): string | null {
    const t = this.tool;
    if (t.kind === 'build' && t.type !== 'road') {
      const a = this.anchorFor(t.type);
      if (!a) return null;
      const check = canPlace(this.state, t.type, a.x, a.y);
      const eff = check.efficiency !== undefined ? `Efficiency ${Math.round(check.efficiency * 100)}%` : null;
      if (!check.ok) return [check.reason, eff].filter(Boolean).join(' · ');
      return eff;
    }
    if (t.kind === 'build' && t.type === 'road' && !this.dragStart) return 'Drag to lay road';
    if (t.kind === 'select' && this.hoverTile) {
      const site = this.siteOn(this.hoverTile.x, this.hoverTile.y);
      if (site) return siteName(site);
    }
    if (t.kind === 'demolish' && !this.dragStart) {
      const b = this.hoverTile && buildingAt(this.state, this.hoverTile.x, this.hoverTile.y);
      if (b) {
        const c = canDemolish(this.state, b);
        return c.ok ? `Demolish ${BUILDINGS[b.type].name}` : c.reason;
      }
    }
    return null;
  }

  overlay(): Overlay {
    const t = this.tool;
    const hover = this.hoverTile ? buildingAt(this.state, this.hoverTile.x, this.hoverTile.y) : undefined;
    const o: Overlay = {
      showGrid: t.kind !== 'select',
      ghost: null,
      path: null,
      hoverId: t.kind === 'build' ? null : (hover?.id ?? null),
      selectedId: this.selectedId,
      selectedSiteId: this.selectedSiteId,
      demolishMode: t.kind === 'demolish',
    };
    if (t.kind === 'build' && t.type !== 'road') {
      const a = this.anchorFor(t.type);
      if (a) o.ghost = { type: t.type, x: a.x, y: a.y, ok: canPlace(this.state, t.type, a.x, a.y).ok };
    } else if (t.kind === 'build' && this.hoverTile) {
      const tiles = this.dragTiles();
      o.path = { tiles, ok: this.roadPlan(tiles), demolish: false };
    } else if (t.kind === 'demolish' && this.dragStart && this.hoverTile) {
      const tiles = this.dragTiles();
      o.path = { tiles, ok: tiles.map(() => true), demolish: true };
    }
    return o;
  }

  private dragTiles(): [number, number][] {
    const h = this.hoverTile!;
    const s = this.dragStart ?? h;
    return lPath(s.x, s.y, h.x, h.y);
  }

  /** Which tiles of a road drag would get a road, counting the running cost. */
  private roadPlan(tiles: [number, number][]): boolean[] {
    const cost = BUILDINGS.road.cost.coins;
    let coins = this.state.coins;
    return tiles.map(([x, y]) => {
      const existing = buildingAt(this.state, x, y);
      if (existing?.type === 'road') return true;
      if (!canPlace(this.state, 'road', x, y).ok || coins < cost) return false;
      coins -= cost;
      return true;
    });
  }

  private onDown(e: PointerEvent): void {
    this.mouse = { x: e.offsetX, y: e.offsetY, inside: true };
    this.updateHover();
    if (e.button === 1 || e.button === 2) {
      this.pan = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
      return;
    }
    if (e.button !== 0) return;
    const t = this.tool;
    if (t.kind === 'select') {
      // Left drag pans too; a click without movement selects.
      this.pan = { x: e.clientX, y: e.clientY, moved: 0, button: 0 };
    } else if ((t.kind === 'build' && t.type === 'road') || t.kind === 'demolish') {
      this.dragStart = this.hoverTile;
    } else if (t.kind === 'build') {
      const a = this.anchorFor(t.type);
      if (!a) return;
      const res = placeBuilding(this.state, t.type, a.x, a.y);
      if (!res.ok) this.toast(res.reason);
    }
  }

  private onMove(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - rect.left;
    this.mouse.y = e.clientY - rect.top;
    if (this.pan) {
      const dx = e.clientX - this.pan.x;
      const dy = e.clientY - this.pan.y;
      this.pan.moved += Math.abs(dx) + Math.abs(dy);
      this.pan.x = e.clientX;
      this.pan.y = e.clientY;
      if (this.pan.moved > 4) this.camera.panBy(dx, dy);
    }
  }

  private onUp(e: PointerEvent): void {
    if (this.pan && e.button === this.pan.button) {
      const click = this.pan.moved <= 4;
      this.pan = null;
      if (!click) return;
      if (e.button === 2) {
        if (this.tool.kind !== 'select') this.setTool({ kind: 'select' });
        else this.select(null);
      } else if (e.button === 0 && this.tool.kind === 'select') {
        const t = this.hoverTile;
        const b = t && buildingAt(this.state, t.x, t.y);
        const site = t && this.siteOn(t.x, t.y);
        if (b && b.type !== 'road') this.select(b.id);
        else if (site) this.selectSite(site.id);
        else this.select(null);
      }
      return;
    }
    if (e.button !== 0 || !this.dragStart || !this.hoverTile) return;
    const tiles = this.dragTiles();
    this.dragStart = null;
    if (this.tool.kind === 'build' && this.tool.type === 'road') this.buildRoad(tiles);
    else if (this.tool.kind === 'demolish') this.demolish(tiles);
  }

  private buildRoad(tiles: [number, number][]): void {
    let lastError: string | null = null;
    let placed = 0;
    for (const [x, y] of tiles) {
      if (buildingAt(this.state, x, y)?.type === 'road') continue;
      const res = placeBuilding(this.state, 'road', x, y);
      if (res.ok) placed++;
      else lastError = res.reason;
    }
    if (!placed && lastError) this.toast(lastError);
  }

  private demolish(tiles: [number, number][]): void {
    let lastError: string | null = null;
    for (const [x, y] of tiles) {
      const res = demolishAt(this.state, x, y);
      if (!res.ok && res.reason !== 'Nothing to demolish.') lastError = res.reason;
      if (res.ok && res.building.id === this.selectedId) this.select(null);
    }
    if (lastError) this.toast(lastError);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { w, h } = this.size();
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
    this.camera.zoomAt(e.offsetX, e.offsetY, factor, w, h);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) {
      this.keys.add(k);
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (k === 'escape') {
      if (this.tool.kind !== 'select') this.setTool({ kind: 'select' });
      else this.select(null);
    } else if (k === 'c') {
      this.onCodex?.();
    } else if (k === ' ') {
      e.preventDefault();
      this.togglePause();
    } else if (k === '1' || k === '2' || k === '3') {
      this.setSpeed(SPEEDS[Number(k) - 1]);
    } else if (k === 'x') {
      this.setTool({ kind: 'demolish' });
    } else if (k === 'delete' && this.selectedId) {
      const b = this.state.buildings.find((o) => o.id === this.selectedId);
      if (b) this.demolish([[b.x, b.y]]);
    } else {
      const def = BUILDING_LIST.find((d) => d.hotkey === k && d.playerBuildable);
      if (def) this.setTool({ kind: 'build', type: def.id });
    }
  }
}
