import { tip } from './tooltip';
import { PAGES } from '../data/lore';
import { RELIC_IDS, RELICS } from '../data/relics';
import { codexProgress, pageText } from '../sim/lore';
import type { GameState } from '../sim/state';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Scramble text into something that looks like cipher, the same way every time. */
function cipher(text: string): string {
  const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  let h = 7;
  return [...text]
    .map((ch) => {
      if (ch === ' ') return ' ';
      h = (h * 31 + ch.charCodeAt(0)) % 9973;
      return glyphs[h % glyphs.length];
    })
    .join('');
}

export function romanNumeral(n: number): string {
  const table: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of table) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

/** The codex: lore pages you have found, the relic shelf, and the names the fog has taken. */
export class Codex {
  private root = el('div', 'codex hidden');
  private body = el('div', 'codex-body');

  constructor(
    parent: HTMLElement,
    private state: GameState,
    private onForget: () => void,
  ) {
    const panel = el('div', 'codex-panel');
    const close = el('button', 'close', '×');
    close.onclick = () => this.close();
    panel.append(close, this.body);
    this.root.append(panel);
    this.root.onclick = (e) => {
      if (e.target === this.root) this.close();
    };
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
    this.render();
    this.root.classList.remove('hidden');
  }

  close(): void {
    this.root.classList.add('hidden');
  }

  private render(): void {
    const s = this.state;
    const b = this.body;
    b.replaceChildren();
    const prog = codexProgress(s);
    b.append(el('h2', '', 'Codex'), el('p', 'codex-sub', `Cycle ${romanNumeral(s.cycle)} · ${prog.read} of ${prog.total} pages read`));

    b.append(el('h3', '', 'What happened to the Lantern Company?'));
    const pages = el('div', 'pages');
    for (const p of PAGES) {
      const state = s.codex[p.id];
      const card = el('article', `page ${state ?? 'missing'}`);
      if (!state) {
        card.append(el('h4', '', 'Missing page'), el('p', '', 'Somewhere in the fog.'));
      } else if (state === 'found') {
        card.append(el('h4', '', 'Written in cipher'), el('p', 'cipher', cipher(p.text).slice(0, 140) + '…'));
        const note = el('p', 'note', s.decipher > 0 ? `An Archive is reading it: ${Math.floor(s.decipher * 100)}%` : 'An Archive could read this.');
        card.append(note);
      } else {
        card.append(el('h4', '', p.title), el('p', '', pageText(s, p)));
      }
      pages.append(card);
    }
    b.append(pages);

    b.append(el('h3', '', 'Relics'));
    const shelf = el('div', 'relics');
    for (const id of RELIC_IDS) {
      const r = RELICS[id];
      const owned = s.relics.includes(id);
      const card = el('div', `relic ${owned ? 'owned' : ''}`);
      if (owned) card.append(el('strong', '', r.name), el('span', 'effect', r.effect), el('em', '', r.flavour));
      else card.append(el('strong', '', '?'), el('span', 'effect', 'Not yet found'));
      shelf.append(card);
    }
    b.append(shelf);

    const names = [...s.echoes, ...s.lostNames];
    if (names.length) {
      b.append(el('h3', '', 'Taken by the fog'), el('p', 'names', names.join(', ')));
    }

    if (s.cycle > 1 || s.relics.length) {
      const forget = el('button', 'forget', 'Forget everything and start over');
      tip(forget, 'Clears your relics, codex and cycle count. This cannot be undone.');
      forget.onclick = () => {
        if (confirm('Forget every relic, page and cycle, and start again from the beginning?')) this.onForget();
      };
      b.append(forget);
    }
  }
}
