/** Camera over the world: `x`, `y` is the world point at the centre of the screen. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1.6;
  readonly minZoom = 0.4;
  readonly maxZoom = 4;

  constructor(
    private worldWidth: number,
    private worldHeight: number,
  ) {}

  screenToWorld(sx: number, sy: number, sw: number, sh: number): { x: number; y: number } {
    return { x: (sx - sw / 2) / this.zoom + this.x, y: (sy - sh / 2) / this.zoom + this.y };
  }

  /** Move by a screen-space delta (e.g. a mouse drag). */
  panBy(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clamp();
  }

  /** Zoom keeping the world point under the cursor fixed. */
  zoomAt(sx: number, sy: number, factor: number, sw: number, sh: number): void {
    const before = this.screenToWorld(sx, sy, sw, sh);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy, sw, sh);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  apply(target: { scale: { set(v: number): void }; position: { set(x: number, y: number): void } }, sw: number, sh: number): void {
    target.scale.set(this.zoom);
    target.position.set(Math.round(sw / 2 - this.x * this.zoom), Math.round(sh / 2 - this.y * this.zoom));
  }

  private clamp(): void {
    this.x = Math.max(0, Math.min(this.worldWidth, this.x));
    this.y = Math.max(0, Math.min(this.worldHeight, this.y));
  }
}
