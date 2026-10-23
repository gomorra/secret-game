/**
 * Styled tooltips for the HUD. Any element with `data-tip` gets one after a short hover.
 * Set the text with `tip(el, text)`; if the tooltip is open it updates in place.
 */
const DELAY_MS = 280;

let box: HTMLDivElement | null = null;
let target: HTMLElement | null = null;
let timer = 0;
const pointer = { x: -1, y: -1 };

/**
 * Panels that re-render swap their elements out from under a resting cursor.
 * Find the tipped element now under the pointer instead.
 */
function resolve(el: HTMLElement | null): HTMLElement | null {
  if (el?.isConnected) return el;
  const under = document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null;
  return under?.closest<HTMLElement>('[data-tip]') ?? null;
}

export function tip(el: HTMLElement, text: string): void {
  if (el.dataset.tip === text) return;
  el.dataset.tip = text;
  if (el === target && box && !box.classList.contains('hidden')) {
    box.textContent = text;
    place(el);
  }
}

export function installTooltips(root: HTMLElement): void {
  box = document.createElement('div');
  box.className = 'tooltip hidden';
  root.append(box);
  document.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  });
  // Follow re-rendered elements while a tooltip is open.
  window.setInterval(() => {
    if (!target || target.isConnected || !box || box.classList.contains('hidden')) return;
    const next = resolve(target);
    if (next) {
      target = next;
      box.textContent = next.dataset.tip ?? '';
      place(next);
    } else hide();
  }, 150);
  document.addEventListener('pointerover', (e) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tip]') ?? null;
    if (el === target) return;
    // The same tip re-rendered under a resting cursor: keep it open.
    if (el && target && !target.isConnected && el.dataset.tip === target.dataset.tip) {
      target = el;
      return;
    }
    hide();
    target = el;
    if (el) timer = window.setTimeout(() => show(el), DELAY_MS);
  });
  document.addEventListener('pointerdown', () => hide());
  window.addEventListener('blur', () => hide());
}

function show(start: HTMLElement): void {
  const el = resolve(start);
  if (!box || !el?.dataset.tip) return;
  target = el;
  box.textContent = el.dataset.tip;
  box.classList.remove('hidden');
  place(el);
}

function hide(): void {
  window.clearTimeout(timer);
  box?.classList.add('hidden');
  target = null;
}

/** Below the element if there's room, otherwise above; kept on screen. */
function place(el: HTMLElement): void {
  if (!box) return;
  const r = el.getBoundingClientRect();
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  if (el.dataset.tipSide === 'right' && r.right + w + 12 < window.innerWidth) {
    box.style.left = `${r.right + 10}px`;
    box.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, r.top + r.height / 2 - h / 2))}px`;
    return;
  }
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const below = r.bottom + 8;
  const top = below + h < window.innerHeight - 8 ? below : Math.max(8, r.top - h - 8);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
}
