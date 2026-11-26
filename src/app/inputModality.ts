const NAVIGATION_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
  'Home',
  'End',
  'Enter',
  ' ',
  'PageUp',
  'PageDown',
]);

export function installInputModality(root: HTMLElement = document.documentElement): () => void {
  const set = (value: 'keyboard' | 'pointer') => {
    if (root.dataset.input !== value) root.dataset.input = value;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (NAVIGATION_KEYS.has(event.key)) set('keyboard');
  };
  const onPointer = () => set('pointer');
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('pointermove', onPointer, true);
  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('pointermove', onPointer, true);
    delete root.dataset.input;
  };
}
