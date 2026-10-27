import { useEffect, useState, type ReactNode } from 'react';

interface LiveStatusProps {
  /** The message. `null`, `false` or `''` is silent. */
  children?: ReactNode;
  /**
   * Bump to read the same text again (the same "Copied" twice): the region
   * empties, then refills on the next tick. Text that changes needs no key.
   */
  announceKey?: string | number;
  id?: string;
  'data-testid'?: string;
}

/**
 * A polite live region for status messages (WCAG 4.1.3): a result count,
 * "Copied", a failed load. Visually hidden, so nothing looks different.
 *
 * The region is always mounted and empty before its text arrives — a live
 * region inserted together with its text is not reliably read out. Mounted
 * with a message already set, it renders empty first and fills one tick later.
 * Later changes render straight through.
 *
 * Render it where it is used, not once app-wide: a region on `document.body`
 * is inert behind an open `<dialog>`, so a screen reader would skip it while a
 * Modal is open. Polite only; an error that must interrupt keeps `role="alert"`
 * on its visible text.
 *
 * Placement: `sr-only` leaves layout, but `space-y-*` and `divide-y` style
 * every child except the last (`:not(:last-child)`). Adding a `LiveStatus` as
 * the new last child moves the old last child's margin or border and shifts
 * the page. Put it before an existing sibling or inside an existing element,
 * never as the new last child of a `space-y-*` / `divide-y` container.
 */
export function LiveStatus({ children, announceKey, id, 'data-testid': testId }: LiveStatusProps) {
  // Quiet = render empty. True on mount, and again when `announceKey` changes
  // (adjusting state during render, so the empty frame commits before the refill).
  const [quiet, setQuiet] = useState(true);
  const [seenKey, setSeenKey] = useState(announceKey);
  if (seenKey !== announceKey) {
    setSeenKey(announceKey);
    setQuiet(true);
  }

  useEffect(() => {
    if (!quiet) return;
    const timer = setTimeout(() => setQuiet(false), 0);
    return () => clearTimeout(timer);
  }, [quiet]);

  return (
    <span role="status" id={id} data-testid={testId} className="sr-only">
      {quiet ? null : children}
    </span>
  );
}
