import { useId, useState, type KeyboardEvent } from 'react';
import { COMBOBOX_NAV_KEYS, moveHighlight, type ComboboxNavKey } from './comboboxNav';

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

  function handleNavKey(event: KeyboardEvent): boolean {
    if (count === 0 || !COMBOBOX_NAV_KEYS.includes(event.key)) return false;
    event.preventDefault();
    setHighlight(moveHighlight(event.key as ComboboxNavKey, activeIndex, count));
    return true;
  }

  const keyed = highlight === null || count === 0 ? null : Math.min(highlight, count - 1);

  return {
    highlight: keyed,
    setHighlight,
    activeIndex,
    reset: () => setHighlight(null),
    optionId,
    handleNavKey,
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
