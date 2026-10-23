import { deserialize, exportString, SaveError } from '../sim/save';
import type { GameState } from '../sim/state';
import type { Controller } from './controller';
import type { Sound } from './sound';

export interface MenuActions {
  /** Save now. False if the browser refused. */
  save(): boolean;
  /** When the game was last saved (performance.now() ms), or null. */
  lastSaved(): number | null;
  /** Replace the current game with an imported one. */
  load(state: GameState): void;
  newIsland(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)} min ago`;
}

/** The game menu: saving, export and import, a new island, and sound. Pauses the game while open. */
export class Menu {
  private root = el('div', 'menu hidden');
  private savedLine = el('p', 'menu-sub');
  private soundButton = el('button', 'menu-button');
  private exportBox = el('textarea', 'save-string');
  private importBox = el('textarea', 'save-string');
  private message = el('p', 'menu-msg');
  private wasPaused = false;
  private timer = 0;

  constructor(
    parent: HTMLElement,
    private state: GameState,
    private ctl: Controller,
    private sound: Sound,
    private actions: MenuActions,
  ) {
    const panel = el('div', 'menu-panel');
    const close = el('button', 'close', '×');
    close.onclick = () => this.close();

    const saveNow = el('button', 'menu-button', 'Save now');
    saveNow.onclick = () => {
      const ok = this.actions.save();
      this.say(ok ? 'Saved.' : this.state.bellRung ? 'The bell has rung. This island is not saved any more.' : 'Your browser would not store the save.', !ok);
      this.refresh();
    };
    this.soundButton.onclick = () => this.sound.toggleMute();
    sound.onChange(() => this.refresh());

    this.exportBox.readOnly = true;
    this.exportBox.rows = 3;
    const copy = el('button', 'menu-button', 'Copy save string');
    copy.onclick = () => this.copy();

    this.importBox.rows = 3;
    this.importBox.placeholder = 'Paste a save string here';
    const load = el('button', 'menu-button', 'Load it');
    load.onclick = () => this.importSave();

    const fresh = el('button', 'menu-button danger', 'Start a new island');
    fresh.onclick = () => {
      if (confirm('Leave this island for a new one? This colony will be lost. Your relics and codex stay.')) this.actions.newIsland();
    };

    panel.append(
      close,
      el('h2', '', 'Fogbound'),
      this.savedLine,
      el('h3', '', 'Save'),
      el('p', 'menu-note', 'The game saves itself every 30 seconds and when you leave.'),
      saveNow,
      el('h3', '', 'Export'),
      el('p', 'menu-note', 'Keep this string somewhere safe to move your colony to another browser.'),
      this.exportBox,
      copy,
      el('h3', '', 'Import'),
      this.importBox,
      load,
      this.message,
      el('h3', '', 'Sound'),
      this.soundButton,
      el('h3', '', 'Island'),
      fresh,
    );
    this.root.append(panel);
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    // While open, keys belong to the menu: Esc closes it, and game hotkeys stay quiet.
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.isOpen) return;
        if (e.key === 'Escape') this.close();
        else if (e.target instanceof HTMLTextAreaElement) return;
        e.stopImmediatePropagation();
      },
      { capture: true },
    );
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.wasPaused = this.ctl.paused;
    if (!this.ctl.paused) this.ctl.togglePause();
    this.exportBox.value = exportString(this.state);
    this.importBox.value = '';
    this.message.textContent = '';
    this.root.classList.remove('hidden');
    this.refresh();
    this.timer = window.setInterval(() => this.refresh(), 1000);
  }

  close(): void {
    this.root.classList.add('hidden');
    window.clearInterval(this.timer);
    if (!this.wasPaused && this.ctl.paused) this.ctl.togglePause();
  }

  private refresh(): void {
    const t = this.actions.lastSaved();
    this.savedLine.textContent = `Island ${this.state.seed} · ${t === null ? 'not saved yet' : `saved ${ago(performance.now() - t)}`}`;
    this.soundButton.textContent = this.sound.muted ? 'Sound: off (M)' : 'Sound: on (M)';
  }

  private say(text: string, bad = false): void {
    this.message.textContent = text;
    this.message.classList.toggle('bad', bad);
  }

  private async copy(): Promise<void> {
    this.exportBox.select();
    try {
      await navigator.clipboard.writeText(this.exportBox.value);
      this.say('Copied.');
    } catch {
      this.say('Selected. Press Ctrl+C to copy.');
    }
  }

  private importSave(): void {
    const text = this.importBox.value.trim();
    if (!text) {
      this.say('Paste a save string first.', true);
      return;
    }
    let state: GameState;
    try {
      state = deserialize(text);
    } catch (e) {
      this.say(e instanceof SaveError ? e.message : 'That save could not be read.', true);
      return;
    }
    if (!confirm(`Load island ${state.seed}? Your current colony will be replaced.`)) return;
    this.actions.load(state);
  }
}
