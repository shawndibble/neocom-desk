import { useId, useState, type KeyboardEvent } from 'react';
import { COMBOBOX_NAV_KEYS, moveHighlight, type ComboboxNavKey } from './comboboxNav';

/**
 * The shared half of a typeahead picker (DESIGN.md §6c "Search picker"): a
 * text input with `role="combobox"`, a listbox beside it, and an arrow-key
 * highlight that moves through `aria-activedescendant` while DOM focus stays
 * in the input. Callers keep what differs per picker: how the options are
 * found, what Enter and Escape do, when the list opens, and how options look.
 *
 * `open` is whether the list is showing. `fallback` is the active option
 * while the keyboard has not chosen one (a default Enter takes, an exact
 * match). The active index is clamped to the list, so a list that shrinks
 * under the highlight never leaves `aria-activedescendant` dangling.
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

  return {
    highlight,
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
    /** Spread on the listbox element; the caller adds its label and class. */
    listboxProps: { id: listboxId, role: 'listbox' as const },
    /** Spread on option `index`; the caller adds its class and handlers. */
    optionProps: (index: number) => ({
      id: optionId(index),
      role: 'option' as const,
      'aria-selected': index === activeIndex,
    }),
  };
}
