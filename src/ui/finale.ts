import { FINALE } from '../data/lore';
import type { GameState } from '../sim/state';

/** The Drowned Bell has rung: the screen goes dark and the first truth comes out. */
export function showFinale(parent: HTMLElement, state: GameState, onWake: () => void): void {
  const names = [...new Set([...state.lostNames, ...state.echoes])].slice(0, 6);
  const nameText = names.length ? names.join(', ') : 'old Hollis, Pell, the cooper’s boy';
  const root = document.createElement('div');
  root.className = 'finale';
  parent.append(root);

  const lines = FINALE.map((line) => line.replaceAll('{names}', nameText));
  // Let the darkness settle before the words come.
  requestAnimationFrame(() => root.classList.add('dark'));
  lines.forEach((text, i) => {
    const p = document.createElement('p');
    p.textContent = text;
    p.style.animationDelay = `${2.5 + i * 4}s`;
    root.append(p);
  });
  const wake = document.createElement('button');
  wake.className = 'wake';
  wake.textContent = 'Wake';
  wake.style.animationDelay = `${2.5 + lines.length * 4}s`;
  wake.onclick = onWake;
  root.append(wake);
}
