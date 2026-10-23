import { Terrain, type GameMap } from '../sim/map';
import { hash2, hashString } from '../sim/rng';
import { COLORS, TILE } from './palette';

type RGB = readonly number[];

/** Everything on the island is a little dimmed: it's always dusk under the fog. */
const DUSK = 0.8;

function css([r, g, b]: RGB, shade = 1): string {
  shade *= DUSK;
  return `rgb(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(b * shade)})`;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Distance (in tiles, capped) from each water tile to the nearest land, for shading depth. */
function waterDepth(map: GameMap, cap = 5): Uint8Array {
  const { width: W, height: H } = map;
  const depth = new Uint8Array(W * H).fill(cap);
  let frontier: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (map.terrain[i] !== Terrain.Water) {
      depth[i] = 0;
      frontier.push(i);
    }
  }
  for (let d = 1; d < cap && frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (depth[j] > d) {
          depth[j] = d;
          next.push(j);
        }
      }
    }
    frontier = next;
  }
  return depth;
}

/** Paints the island onto a canvas, one TILE-sized square per tile. */
export class TerrainPainter {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private drawn: Int8Array;
  private depth: Uint8Array;
  private seed: number;

  constructor(private map: GameMap, seed: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = map.width * TILE;
    this.canvas.height = map.height * TILE;
    this.ctx = this.canvas.getContext('2d')!;
    this.drawn = new Int8Array(map.width * map.height).fill(-1);
    this.depth = waterDepth(map);
    this.seed = hashString(seed);
  }

  /** Redraw tiles whose terrain changed. Returns true if anything was drawn. */
  sync(): boolean {
    let changed = false;
    const { width: W, height: H, terrain } = this.map;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (this.drawn[i] === terrain[i]) continue;
        this.drawTile(x, y, terrain[i]);
        this.drawn[i] = terrain[i];
        changed = true;
      }
    }
    return changed;
  }

  private rnd(x: number, y: number, k: number): number {
    return hash2(x * 7 + k, y * 13 - k, this.seed);
  }

  private drawTile(x: number, y: number, t: Terrain): void {
    const c = this.ctx;
    const px = x * TILE;
    const py = y * TILE;
    // Clip to the tile so redrawing one tile never leaves bits on its neighbours.
    c.save();
    c.beginPath();
    c.rect(px, py, TILE, TILE);
    c.clip();
    this.paint(c, x, y, px, py, t);
    c.restore();
  }

  private paint(c: CanvasRenderingContext2D, x: number, y: number, px: number, py: number, t: Terrain): void {
    const jitter = 0.92 + this.rnd(x, y, 1) * 0.16;
    const dot = (cx: number, cy: number, r: number, color: string) => {
      c.fillStyle = color;
      c.beginPath();
      c.arc(px + cx, py + cy, r, 0, Math.PI * 2);
      c.fill();
    };

    switch (t) {
      case Terrain.Water: {
        const d = this.depth[y * this.map.width + x];
        const col = mix(COLORS.shallowWater, COLORS.deepWater, Math.min(1, (d - 1) / 4));
        c.fillStyle = css(col, 0.96 + this.rnd(x, y, 2) * 0.08);
        c.fillRect(px, py, TILE, TILE);
        if (this.rnd(x, y, 3) > 0.8) {
          c.fillStyle = css(col, 1.35);
          c.fillRect(px + 3 + this.rnd(x, y, 4) * 6, py + 4 + this.rnd(x, y, 5) * 8, 4, 1);
        }
        break;
      }
      case Terrain.Coast:
        c.fillStyle = css(COLORS.coast, jitter);
        c.fillRect(px, py, TILE, TILE);
        for (let k = 0; k < 3; k++) {
          dot(2 + this.rnd(x, y, 10 + k) * 12, 2 + this.rnd(x, y, 20 + k) * 12, 0.8, css(COLORS.coast, 1.2));
        }
        break;
      case Terrain.Grass:
        c.fillStyle = css(COLORS.grass, jitter);
        c.fillRect(px, py, TILE, TILE);
        c.fillStyle = css(COLORS.grass, 1.25);
        for (let k = 0; k < 4; k++) {
          c.fillRect(px + 1 + this.rnd(x, y, 30 + k) * 13, py + 1 + this.rnd(x, y, 40 + k) * 12, 1, 2);
        }
        break;
      case Terrain.Fertile:
        c.fillStyle = css(COLORS.fertile, jitter);
        c.fillRect(px, py, TILE, TILE);
        c.fillStyle = css(COLORS.fertileFurrow, jitter);
        for (let k = 2; k < TILE; k += 4) c.fillRect(px, py + k, TILE, 1);
        break;
      case Terrain.Forest: {
        c.fillStyle = css(COLORS.forestFloor, jitter);
        c.fillRect(px, py, TILE, TILE);
        const trees = 2 + Math.floor(this.rnd(x, y, 50) * 2);
        for (let k = 0; k < trees; k++) {
          const tx = 4 + this.rnd(x, y, 60 + k) * 8;
          const ty = 4 + this.rnd(x, y, 70 + k) * 8;
          const r = 2.6 + this.rnd(x, y, 80 + k) * 1.4;
          dot(tx + 0.8, ty + 1, r, css(COLORS.treeDark, 0.7));
          dot(tx, ty, r, css(COLORS.treeDark, jitter));
          dot(tx - r * 0.3, ty - r * 0.3, r * 0.55, css(COLORS.treeLight, jitter));
        }
        break;
      }
      case Terrain.Marsh:
        c.fillStyle = css(COLORS.marsh, jitter);
        c.fillRect(px, py, TILE, TILE);
        c.fillStyle = css(COLORS.marshPool, 1);
        c.fillRect(px + 2 + this.rnd(x, y, 90) * 6, py + 3 + this.rnd(x, y, 91) * 8, 6, 3);
        c.fillStyle = css(COLORS.reeds, jitter);
        for (let k = 0; k < 4; k++) {
          c.fillRect(px + 1 + this.rnd(x, y, 92 + k) * 13, py + 2 + this.rnd(x, y, 96 + k) * 8, 1, 4);
        }
        break;
      case Terrain.Rock: {
        c.fillStyle = css(COLORS.rockShadow, jitter);
        c.fillRect(px, py, TILE, TILE);
        const cx = 4 + this.rnd(x, y, 100) * 8;
        const cy = 4 + this.rnd(x, y, 101) * 8;
        c.fillStyle = css(COLORS.rock, jitter);
        c.beginPath();
        c.moveTo(px + cx - 6, py + cy + 4);
        c.lineTo(px + cx - 2, py + cy - 5);
        c.lineTo(px + cx + 5, py + cy - 3);
        c.lineTo(px + cx + 6, py + cy + 4);
        c.closePath();
        c.fill();
        c.fillStyle = css(COLORS.rockLight, jitter);
        c.fillRect(px + cx - 2, py + cy - 4, 3, 2);
        break;
      }
    }
  }
}
