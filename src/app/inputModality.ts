/**
 * Which input drove the last interaction, as `data-input` on `<html>`.
 *
 * The active option of a menu or picker draws its accent outline only while
 * this reads `keyboard` (`activeOptionClassName`, controlStyles.ts), so a
 * pointer hovering an option never shows a ring that looks like a bug. Set
 * here and nowhere else.
 */
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
