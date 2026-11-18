import { useId, useState, type KeyboardEvent } from 'react';
import { COMBOBOX_NAV_KEYS, moveHighlight, type ComboboxNavKey } from './comboboxNav';

/**
 * Shared typeahead behaviour: role=combobox input, listbox, aria-activedescendant
 * highlight. Callers own option lookup, Enter/Escape, open timing and option look.
 * The index is clamped so a shrinking list never leaves activedescendant dangling.
 */
export function useCombobox({
  count,
  open,
  fallback,
}: {
  count: number;
  open: boolean;
  fallback?: number | null;
}) {
  const base = useId();
  const listboxId = `${base}-listbox`;
  const [highlight, setHighlight] = useState<number | null>(null);
  const wanted = highlight ?? fallback ?? null;
  const activeIndex = open && wanted !== null && count > 0 ? Math.min(wanted, count - 1) : null;
  const optionId = (index: number) => `${base}-option-${index}`;

  /** Handles Arrow/Home/End; true when it did, so the caller can open the list. */
  function handleNavKey(event: KeyboardEvent): boolean {
    if (count === 0 || !COMBOBOX_NAV_KEYS.includes(event.key)) return false;
    event.preventDefault();
    setHighlight(moveHighlight(event.key as ComboboxNavKey, activeIndex, count));
    return true;
  }

  // Clamped like `activeIndex`, so Enter never reads past a list that shrank.
  const keyed = highlight === null || count === 0 ? null : Math.min(highlight, count - 1);

  return {
    highlight: keyed,
    setHighlight,
    activeIndex,
    reset: () => setHighlight(null),
    optionId,
    handleNavKey,
    /** Spread on the `<input>`; the caller adds its own label, value and handlers. */
    inputProps: {
      role: 'combobox' as const,
      'aria-autocomplete': 'list' as const,
      'aria-expanded': open,
      'aria-controls': open ? listboxId : undefined,
      'aria-activedescendant': activeIndex === null ? undefined : optionId(activeIndex),
    },
    listboxProps: { id: listboxId, role: 'listbox' as const },
    optionProps: (index: number) => ({
      id: optionId(index),
      role: 'option' as const,
      'aria-selected': index === activeIndex,
    }),
  };
}
