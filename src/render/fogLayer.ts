import { Sprite, Texture } from 'pixi.js';
import { litGrid } from '../sim/fog';
import { hashString, valueNoise } from '../sim/rng';
import type { GameState } from '../sim/state';
import { TILE } from './palette';

/** Fog alpha for each tile state. */
const ALPHA_DARK = 0.95;
const ALPHA_EXPLORED = 0.62;
const ALPHA_LIT = 0;
/** How fast the drawn fog chases the real fog, per second. */
const EASE = 2.5;
/** The fog texture has this many pixels per tile, blurred so edges are soft rather than stepped. */
const SCALE = 4;
const BLUR_PX = 3;

/**
 * The fog over the island. One pixel per tile, stretched with smooth filtering
 * so light fades softly into fog. Unlit fog drifts slowly.
 */
export class FogLayer {
  readonly sprite: Sprite;
  /** One pixel per tile. */
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  /** Upscaled and blurred copy that becomes the texture. */
  private soft = document.createElement('canvas');
  private softCtx: CanvasRenderingContext2D;
  private image: ImageData;
  private alpha: Float32Array;
  private texture: Texture;
  private seed: number;
  private time = 0;
  /** How far a surge has rolled in (0..1). Thickens explored fog. */
  private surge = 0;

  constructor(private state: GameState) {
    const { width: W, height: H } = state.map;
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(W, H);
    this.soft.width = W * SCALE;
    this.soft.height = H * SCALE;
    this.softCtx = this.soft.getContext('2d')!;
    this.softCtx.imageSmoothingEnabled = true;
    // Blur where supported (Chromium, Firefox); elsewhere smooth upscaling alone still softens the edges.
    if ('filter' in this.softCtx) this.softCtx.filter = `blur(${BLUR_PX}px)`;
    this.alpha = new Float32Array(W * H);
    this.seed = hashString(state.seed + ':fog');
    // Start already settled, so the first frame doesn't fade in from nothing.
    const lit = litGrid(state);
    for (let i = 0; i < W * H; i++) this.alpha[i] = this.target(i, lit);
    this.texture = Texture.from(this.soft);
    this.texture.source.scaleMode = 'linear';
    this.sprite = new Sprite(this.texture);
    this.sprite.scale.set(TILE / SCALE);
    this.draw();
  }

  private target(i: number, lit: Uint8Array): number {
    if (lit[i]) return ALPHA_LIT;
    return this.state.explored[i] ? ALPHA_EXPLORED + this.surge * 0.15 : ALPHA_DARK;
  }

  update(dt: number): void {
    this.time += dt;
    this.surge = this.state.tolling.strength;
    const lit = litGrid(this.state);
    const k = Math.min(1, dt * EASE);
    for (let i = 0; i < this.alpha.length; i++) this.alpha[i] += (this.target(i, lit) - this.alpha[i]) * k;
    this.draw();
  }

  private draw(): void {
    const { width: W, height: H } = this.state.map;
    const px = this.image.data;
    const t = this.time * 0.06;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        // Drifting wisps: a little noise in colour and density where the fog is thick.
        const n = valueNoise(x * 0.18 + t, y * 0.18 - t * 0.6, this.seed);
        const a = this.alpha[i];
        const wisp = a > 0.3 ? (n - 0.5) * 0.08 : 0;
        const p = i * 4;
        px[p] = 9 + n * 10;
        px[p + 1] = 13 + n * 12;
        px[p + 2] = 19 + n * 16;
        px[p + 3] = Math.max(0, Math.min(255, (a + wisp) * 255));
      }
    }
    this.ctx.putImageData(this.image, 0, 0);
    const sc = this.softCtx;
    sc.clearRect(0, 0, this.soft.width, this.soft.height);
    sc.drawImage(this.canvas, 0, 0, W * SCALE, H * SCALE);
    this.texture.source.update();
  }
}
