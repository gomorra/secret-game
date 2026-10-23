import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import { lightRadius } from '../sim/fog';
import { inBounds } from '../sim/map';
import { derived, footprint, type Building, type GameState } from '../sim/state';
import { COLORS, TILE } from './palette';
import { FogLayer } from './fogLayer';
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
  private glows = new Map<number, Sprite>();
  readonly fog: FogLayer;
  private lastRev = -1;
  private time = 0;

  constructor(private state: GameState) {
    this.painter = new TerrainPainter(state.map, state.seed);
    this.painter.sync();
    this.terrainTexture = Texture.from(this.painter.canvas);
    const terrain = new Sprite(this.terrainTexture);
    this.drawGrid();
    this.grid.visible = false;
    this.fog = new FogLayer(state);
    // Fog sits over the buildings; the lights' glow is added on top so it shines through.
    this.root.addChild(terrain, this.grid, this.roads, this.buildingLayer, this.fog.sprite, this.glowLayer, this.overlay);
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
    this.fog.update(dt);
    this.updateGlows();
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
    for (const [id, glow] of this.glows) {
      if (!alive.has(id)) {
        glow.destroy();
        this.glows.delete(id);
      }
    }

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
      if (BUILDINGS[b.type].light && !this.glows.has(b.id)) {
        const glow = new Sprite(this.glowTex);
        glow.anchor.set(0.5);
        glow.blendMode = 'add';
        const [w, h] = BUILDINGS[b.type].size;
        glow.position.set((b.x + w / 2) * TILE, (b.y + h / 2) * TILE);
        this.glowLayer.addChild(glow);
        this.glows.set(b.id, glow);
      }
    }
  }

  /** Glows follow each light's real radius, with a little flame flicker. */
  private updateGlows(): void {
    const d = derived(this.state);
    for (const [id, glow] of this.glows) {
      const b = d.byId.get(id);
      if (!b) continue;
      const r = lightRadius(this.state, b);
      const fuelled = !!BUILDINGS[b.type].light?.fuel;
      const flicker = fuelled ? 0.92 + 0.08 * Math.sin(this.time * 9 + id * 1.7) * Math.sin(this.time * 3.3 + id) : 1;
      glow.visible = r > 0.2;
      glow.width = glow.height = Math.max(1, (r * 2 + 3) * TILE * 1.1);
      glow.alpha = Math.min(1, (b.intensity ?? 0) * 0.9) * flicker;
    }
  }

  private updateBuilding(b: Building): void {
    const v = this.views.get(b.id);
    if (!v) return;
    const def = BUILDINGS[b.type];
    const [w, h] = def.size;
    const W = w * TILE;
    const H = h * TILE;

    const scared = (b.dread ?? 0) >= 50;
    const empty = (b.emptyFor ?? 0) > 0;
    const key = `${b.status}|${b.residents ?? 0}|${b.tier ?? 0}|${b.fueled}|${scared}|${empty}`;
    if (key !== v.key) {
      v.key = key;
      const g = v.body;
      g.clear();
      g.roundRect(2, 3, W - 2, H - 2, 3).fill({ color: 0x000000, alpha: 0.35 });
      if (b.type === 'house') this.drawHouse(g, b, W, H, def.color);
      else if (def.light) this.drawLight(g, b, W, H);
      else {
        g.roundRect(1, 1, W - 2, H - 2, 3).fill(def.color).stroke({ width: 1, color: shade(def.color, 0.55) });
        g.roundRect(1, 1, W - 2, 6, 3).fill(shade(def.color, 0.75));
        if (b.type === 'warehouse') {
          g.moveTo(5, 10).lineTo(W - 5, H - 5).moveTo(W - 5, 10).lineTo(5, H - 5).stroke({ width: 1, color: shade(def.color, 0.6) });
        }
      }
      // Status badge.
      const bad = b.status === 'unconnected' || b.status === 'noResource' || b.status === 'noFuel' || b.status === 'dark';
      const warn = b.status === 'noInput' || b.status === 'storageFull' || b.status === 'needsUnmet';
      if (bad || warn) {
        g.circle(W - 3, 3, 3.5).fill(bad ? COLORS.bad : COLORS.warn).stroke({ width: 1, color: 0x1a1410 });
        g.rect(W - 3.5, 1, 1, 3).fill(0x1a1410);
        g.rect(W - 3.5, 5, 1, 1).fill(0x1a1410);
      }
      // A violet mark on houses whose residents are growing afraid.
      if (scared && b.type === 'house' && (b.residents ?? 0) > 0) {
        g.circle(3, 3, 3).fill(COLORS.dread).stroke({ width: 1, color: 0x1a1410 });
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
    const tier = b.tier ?? 1;
    const lit = (b.residents ?? 0) > 0;
    const win = lit ? COLORS.warmLight : 0x1d1712;
    this.drawHouseBody(g, tier, W, H, color, win, lit);
    if ((b.emptyFor ?? 0) > 0) {
      // The door hangs open onto darkness.
      g.rect(W / 2 - 3, H - 10, 6, 8).fill(0x020203);
      g.poly([W / 2 + 3, H - 10, W / 2 + 6, H - 9, W / 2 + 6, H - 2, W / 2 + 3, H - 2]).fill(0x4a3424);
    }
  }

  private drawLight(g: Graphics, b: Building, W: number, H: number): void {
    const flame = b.fueled ? COLORS.warmLight : 0x2a2420;
    const core = b.fueled ? 0xfff4d6 : 0x3a332c;
    if (b.type === 'lantern') {
      g.rect(TILE / 2 - 1, 5, 2, 9).fill(0x3b3226);
      g.circle(TILE / 2, 5, 3.2).fill(COLORS.warmLight);
      g.circle(TILE / 2, 5, 1.6).fill(0xfff4d6);
    } else if (b.type === 'brazier') {
      g.rect(TILE / 2 - 1, 9, 2, 5).fill(0x2e2620);
      g.poly([3, 7, TILE - 3, 7, TILE - 5, 11, 5, 11]).fill(0x4a3e34).stroke({ width: 1, color: 0x1e1814 });
      g.poly([5, 7, TILE / 2, 1, TILE - 5, 7]).fill(flame);
      g.circle(TILE / 2, 5.5, 1.4).fill(core);
    } else if (b.type === 'lanternPost') {
      g.rect(TILE / 2 - 1, 4, 2, 11).fill(0x2a2622);
      g.rect(TILE / 2 - 3.5, 2, 7, 6).fill(0x2a2622);
      g.rect(TILE / 2 - 2.5, 3, 5, 4).fill(flame);
      g.circle(TILE / 2, 5, 1.2).fill(core);
    } else {
      // Lighthouse: a striped tower with a lamp room.
      const cx = W / 2;
      g.poly([cx - 7, H - 2, cx - 4, 8, cx + 4, 8, cx + 7, H - 2]).fill(0xd8d0c0).stroke({ width: 1, color: 0x4a443c });
      g.poly([cx - 5.6, H - 9, cx - 4.8, 15, cx + 4.8, 15, cx + 5.6, H - 9]).fill(0x8a3a30);
      g.rect(cx - 5, 3, 10, 6).fill(0x2a2622);
      g.rect(cx - 3.5, 4, 7, 4).fill(flame);
      g.circle(cx, 6, 1.8).fill(core);
      g.poly([cx - 6, 3, cx, -1, cx + 6, 3]).fill(0x3a3430);
    }
  }

  private drawHouseBody(g: Graphics, tier: number, W: number, H: number, color: number, win: number, lit: boolean): void {
    if (tier === 1) {
      // Castaways: a small timber hut.
      const wallTop = H * 0.45;
      g.rect(3, wallTop, W - 6, H - wallTop - 2).fill(color).stroke({ width: 1, color: shade(color, 0.55) });
      g.poly([1, wallTop + 1, W / 2, 3, W - 1, wallTop + 1]).fill(0x5a3a2c).stroke({ width: 1, color: 0x2e1d16 });
      g.rect(W / 2 - 2.5, H - 9, 5, 7).fill(0x2a1d14);
      g.rect(6, wallTop + 4, 4, 4).fill(win);
      g.rect(W - 10, wallTop + 4, 4, 4).fill(win);
    } else if (tier === 2) {
      // Lamplighters: stone ground floor, timber upper floor, chimney, a lamp by the door.
      const wallTop = H * 0.35;
      g.rect(W - 10, 2, 4, 8).fill(0x4a4440);
      g.rect(2, wallTop, W - 4, H - wallTop - 2).fill(0xa08060).stroke({ width: 1, color: 0x4a3828 });
      g.rect(2, H * 0.68, W - 4, H * 0.32 - 2).fill(0x77736c).stroke({ width: 1, color: 0x45423d });
      g.poly([0, wallTop + 1, W / 2, 1, W, wallTop + 1]).fill(0x7a3328).stroke({ width: 1, color: 0x3a1a14 });
      for (const x of [5, W / 2 - 2, W - 9]) g.rect(x, wallTop + 4, 4, 4).fill(win);
      g.rect(W / 2 - 2.5, H - 9, 5, 7).fill(0x2a1d14);
      g.circle(W / 2 + 6, H - 8, 1.6).fill(lit ? COLORS.warmLight : 0x3a3020);
    } else {
      // Scholars: tall stone house with a slate roof and a lit study window up top.
      const wallTop = H * 0.3;
      g.rect(2, wallTop, W - 4, H - wallTop - 2).fill(0x8a8680).stroke({ width: 1, color: 0x45423d });
      g.poly([0, wallTop + 1, 6, 1, W - 6, 1, W, wallTop + 1]).fill(0x3e4660).stroke({ width: 1, color: 0x1e2230 });
      g.rect(W / 2 - 3, 3, 6, 5).fill(win);
      for (const y of [wallTop + 4, wallTop + 11]) {
        g.rect(5, y, 4, 4).fill(win);
        g.rect(W - 9, y, 4, 4).fill(win);
      }
      g.rect(W / 2 - 3, H - 10, 6, 8).fill(0x2a1d14);
    }
  }

  private drawOverlay(o: Overlay): void {
    const g = this.overlay;
    g.clear();
    const d = derived(this.state);

    const outline = (b: Building, color: number, width: number) => {
      const f = footprint(b);
      g.rect(f.x * TILE, f.y * TILE, f.w * TILE, f.h * TILE).stroke({ width, color, alpha: 0.9 });
    };
    const range = (cx: number, cy: number, r: number) => {
      g.rect((cx - r) * TILE, (cy - r) * TILE, 2 * r * TILE, 2 * r * TILE)
        .fill({ color: COLORS.warmLight, alpha: 0.05 })
        .stroke({ width: 1, color: COLORS.warmLight, alpha: 0.5 });
    };
    if (o.selectedId) {
      const b = d.byId.get(o.selectedId);
      if (b) {
        outline(b, COLORS.select, 1.5);
        const [bw, bh] = BUILDINGS[b.type].size;
        const r = BUILDINGS[b.type].serviceRadius;
        if (r) range(b.x + bw / 2, b.y + bh / 2, r);
        if (BUILDINGS[b.type].light) {
          g.circle((b.x + bw / 2) * TILE, (b.y + bh / 2) * TILE, Math.max(0.5, lightRadius(this.state, b)) * TILE).stroke({
            width: 1,
            color: COLORS.warmLight,
            alpha: 0.6,
          });
        }
      }
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
      if (def.serviceRadius) range(x + w / 2, y + h / 2, def.serviceRadius);
      if (def.light) {
        g.circle((x + w / 2) * TILE, (y + h / 2) * TILE, def.light.radius * TILE)
          .fill({ color: COLORS.warmLight, alpha: 0.06 })
          .stroke({ width: 1, color: COLORS.warmLight, alpha: 0.6 });
      }
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
            if (!this.state.explored[ty * this.state.map.width + tx]) continue;
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
