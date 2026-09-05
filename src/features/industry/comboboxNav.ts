export type ComboboxNavKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

/**
 * Roving-highlight index math for a listbox attached to a text input, kept
 * free of the DOM so it's cheap to test: arrows wrap end-to-end, Home/End
 * jump regardless of the current index, and an empty list always highlights
 * nothing.
 */
export function moveHighlight(
  key: ComboboxNavKey,
  current: number | null,
  count: number
): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowDown':
      return current === null ? 0 : (current + 1) % count;
    case 'ArrowUp':
      return current === null ? count - 1 : (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
  }
}
