import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import { inBounds } from '../sim/map';
import { derived, footprint, type Building, type GameState } from '../sim/state';
import { COLORS, TILE } from './palette';
import { TerrainPainter } from './terrain';

/** What the input layer wants drawn on top of the world. */
export interface Overlay {
  showGrid: boolean;
  ghost: { type: BuildingId; x: number; y: number; ok: boolean } | null;
  /** Tiles of a road or demolish drag, each marked valid or not. */
  path: { tiles: [number, number][]; ok: boolean[]; demolish: boolean } | null;
  hoverId: number | null;
  selectedId: number | null;
  demolishMode: boolean;
}

interface BuildingView {
  root: Container;
  body: Graphics;
  bar: Graphics;
  key: string;
}

function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

/** A soft radial glow texture, drawn once. */
function glowTexture(): Texture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,200,120,0.55)');
  g.addColorStop(0.35, 'rgba(255,170,80,0.22)');
  g.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(c);
}

export class WorldView {
  readonly root = new Container();
  private painter: TerrainPainter;
  private terrainTexture: Texture;
  private grid = new Graphics();
  private roads = new Graphics();
  private buildingLayer = new Container();
  private glowLayer = new Container();
  private overlay = new Graphics();
  private views = new Map<number, BuildingView>();
  private glowTex = glowTexture();
  private lastRev = -1;
  private time = 0;

  constructor(private state: GameState) {
    this.painter = new TerrainPainter(state.map, state.seed);
    this.painter.sync();
    this.terrainTexture = Texture.from(this.painter.canvas);
    const terrain = new Sprite(this.terrainTexture);
    this.drawGrid();
    this.grid.visible = false;
    this.root.addChild(terrain, this.grid, this.roads, this.buildingLayer, this.glowLayer, this.overlay);
  }

  update(dt: number, overlay: Overlay): void {
    this.time += dt;
    const s = this.state;
    if (this.painter.sync()) this.terrainTexture.source.update();
    if (s.rev !== this.lastRev) {
      this.lastRev = s.rev;
      this.drawRoads();
      this.syncBuildings();
    }
    for (const b of s.buildings) this.updateBuilding(b);
    this.grid.visible = overlay.showGrid;
    this.drawOverlay(overlay);
  }

  private drawGrid(): void {
    const { width: W, height: H } = this.state.map;
    const g = this.grid;
    for (let x = 0; x <= W; x++) g.moveTo(x * TILE, 0).lineTo(x * TILE, H * TILE);
    for (let y = 0; y <= H; y++) g.moveTo(0, y * TILE).lineTo(W * TILE, y * TILE);
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.05 });
  }

  private drawRoads(): void {
    const g = this.roads;
    g.clear();
    const d = derived(this.state);
    const { map } = this.state;
    const isRoad = (x: number, y: number) => {
      if (!inBounds(map, x, y)) return false;
      const id = d.occ[y * map.width + x];
      return id !== 0 && d.byId.get(id)!.type === 'road';
    };
    const touchesBuilding = (x: number, y: number) => {
      if (!inBounds(map, x, y)) return false;
      const id = d.occ[y * map.width + x];
      return id !== 0 && d.byId.get(id)!.type !== 'road';
    };
    for (const b of this.state.buildings) {
      if (b.type !== 'road') continue;
      const color = d.roadNet[b.y * map.width + b.x] ? COLORS.road : COLORS.roadUnconnected;
      const px = b.x * TILE;
      const py = b.y * TILE;
      const inset = 3;
      g.rect(px + inset, py + inset, TILE - inset * 2, TILE - inset * 2);
      const arms: [number, number, number, number, number, number][] = [
        [b.x + 1, b.y, px + TILE - inset, py + inset, inset, TILE - inset * 2],
        [b.x - 1, b.y, px, py + inset, inset, TILE - inset * 2],
        [b.x, b.y + 1, px + inset, py + TILE - inset, TILE - inset * 2, inset],
        [b.x, b.y - 1, px + inset, py, TILE - inset * 2, inset],
      ];
      for (const [nx, ny, ax, ay, aw, ah] of arms) {
        if (isRoad(nx, ny) || touchesBuilding(nx, ny)) g.rect(ax, ay, aw, ah);
      }
      g.fill(color);
    }
  }

  private syncBuildings(): void {
    const alive = new Set(this.state.buildings.map((b) => b.id));
    for (const [id, v] of this.views) {
      if (!alive.has(id)) {
        v.root.destroy({ children: true });
        this.views.delete(id);
      }
    }
    for (const c of this.glowLayer.removeChildren()) c.destroy();

    for (const b of this.state.buildings) {
      if (b.type === 'road') continue;
      if (!this.views.has(b.id)) {
        const root = new Container();
        root.position.set(b.x * TILE, b.y * TILE);
        const body = new Graphics();
        const bar = new Graphics();
        root.addChild(body);
        const def = BUILDINGS[b.type];
        if (def.glyph && b.type !== 'house' && b.type !== 'lantern') {
          const label = new Text({
            text: def.glyph,
            style: { fontFamily: 'Georgia, serif', fontSize: 11, fill: 0xf3e6cc, fontWeight: 'bold' },
            resolution: 4,
          });
          label.anchor.set(0.5);
          label.position.set((def.size[0] * TILE) / 2, (def.size[1] * TILE) / 2 + 1);
          root.addChild(label);
        }
        root.addChild(bar);
        this.buildingLayer.addChild(root);
        this.views.set(b.id, { root, body, bar, key: '' });
      }
      if (b.type === 'lantern') {
        const glow = new Sprite(this.glowTex);
        glow.anchor.set(0.5);
        glow.blendMode = 'add';
        glow.width = glow.height = TILE * 22;
        glow.position.set((b.x + 0.5) * TILE, (b.y + 0.5) * TILE);
        this.glowLayer.addChild(glow);
      }
    }
  }

  private updateBuilding(b: Building): void {
    const v = this.views.get(b.id);
    if (!v) return;
    const def = BUILDINGS[b.type];
    const [w, h] = def.size;
    const W = w * TILE;
    const H = h * TILE;

    const key = `${b.status}|${b.residents ?? 0}`;
    if (key !== v.key) {
      v.key = key;
      const g = v.body;
      g.clear();
      g.roundRect(2, 3, W - 2, H - 2, 3).fill({ color: 0x000000, alpha: 0.35 });
      if (b.type === 'house') this.drawHouse(g, b, W, H, def.color);
      else if (b.type === 'lantern') {
        g.rect(TILE / 2 - 1, 5, 2, 9).fill(0x3b3226);
        g.circle(TILE / 2, 5, 3.2).fill(COLORS.warmLight);
        g.circle(TILE / 2, 5, 1.6).fill(0xfff4d6);
      } else {
        g.roundRect(1, 1, W - 2, H - 2, 3).fill(def.color).stroke({ width: 1, color: shade(def.color, 0.55) });
        g.roundRect(1, 1, W - 2, 6, 3).fill(shade(def.color, 0.75));
        if (b.type === 'warehouse') {
          g.moveTo(5, 10).lineTo(W - 5, H - 5).moveTo(W - 5, 10).lineTo(5, H - 5).stroke({ width: 1, color: shade(def.color, 0.6) });
        }
      }
      // Status badge.
      const bad = b.status === 'unconnected' || b.status === 'noResource';
      const warn = b.status === 'noInput' || b.status === 'storageFull' || b.status === 'needsUnmet';
      if (bad || warn) {
        g.circle(W - 3, 3, 3.5).fill(bad ? COLORS.bad : COLORS.warn).stroke({ width: 1, color: 0x1a1410 });
        g.rect(W - 3.5, 1, 1, 3).fill(0x1a1410);
        g.rect(W - 3.5, 5, 1, 1).fill(0x1a1410);
      }
    }

    // Production progress bar.
    const bar = v.bar;
    bar.clear();
    if (def.production && b.active) {
      bar.rect(3, H - 4, W - 6, 2).fill({ color: 0x000000, alpha: 0.5 });
      bar.rect(3, H - 4, (W - 6) * Math.min(1, b.progress ?? 0), 2).fill(COLORS.warmLight);
    }
  }

  private drawHouse(g: Graphics, b: Building, W: number, H: number, color: number): void {
    const wallTop = H * 0.45;
    g.rect(3, wallTop, W - 6, H - wallTop - 2).fill(color).stroke({ width: 1, color: shade(color, 0.55) });
    g.poly([1, wallTop + 1, W / 2, 3, W - 1, wallTop + 1]).fill(0x5a3a2c).stroke({ width: 1, color: 0x2e1d16 });
    g.rect(W / 2 - 2.5, H - 9, 5, 7).fill(0x2a1d14);
    const lit = (b.residents ?? 0) > 0;
    const win = lit ? COLORS.warmLight : 0x1d1712;
    g.rect(6, wallTop + 4, 4, 4).fill(win);
    g.rect(W - 10, wallTop + 4, 4, 4).fill(win);
  }

  private drawOverlay(o: Overlay): void {
    const g = this.overlay;
    g.clear();
    const d = derived(this.state);

    const outline = (b: Building, color: number, width: number) => {
      const f = footprint(b);
      g.rect(f.x * TILE, f.y * TILE, f.w * TILE, f.h * TILE).stroke({ width, color, alpha: 0.9 });
    };
    if (o.selectedId) {
      const b = d.byId.get(o.selectedId);
      if (b) outline(b, COLORS.select, 1.5);
    }
    if (o.hoverId && o.hoverId !== o.selectedId) {
      const b = d.byId.get(o.hoverId);
      if (b) outline(b, o.demolishMode ? COLORS.bad : 0xffffff, 1);
    }

    if (o.ghost) {
      const { type, x, y, ok } = o.ghost;
      const def = BUILDINGS[type];
      const [w, h] = def.size;
      const color = ok ? COLORS.ok : COLORS.bad;
      if (def.resource) {
        // Show the harvest area and the tiles that count toward it.
        const r = def.resource.radius;
        g.rect((x - r) * TILE, (y - r) * TILE, (w + 2 * r) * TILE, (h + 2 * r) * TILE).stroke({
          width: 1,
          color: COLORS.warmLight,
          alpha: 0.5,
        });
        for (let ty = y - r; ty < y + h + r; ty++) {
          for (let tx = x - r; tx < x + w + r; tx++) {
            if (tx >= x && tx < x + w && ty >= y && ty < y + h) continue;
            if (!inBounds(this.state.map, tx, ty)) continue;
            if (d.occ[ty * this.state.map.width + tx]) continue;
            if (def.resource.terrain.includes(this.state.map.terrain[ty * this.state.map.width + tx])) {
              g.circle((tx + 0.5) * TILE, (ty + 0.5) * TILE, 2).fill({ color: COLORS.warmLight, alpha: 0.6 });
            }
          }
        }
      }
      g.rect(x * TILE, y * TILE, w * TILE, h * TILE).fill({ color, alpha: 0.3 }).stroke({ width: 1, color, alpha: 0.9 });
    }

    if (o.path) {
      o.path.tiles.forEach(([x, y], i) => {
        const color = o.path!.demolish ? COLORS.bad : o.path!.ok[i] ? COLORS.ok : COLORS.bad;
        g.rect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2).fill({ color, alpha: o.path!.ok[i] ? 0.35 : 0.2 });
      });
    }
  }
}
