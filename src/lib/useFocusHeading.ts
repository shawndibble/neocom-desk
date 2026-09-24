import { useEffect, useRef, type RefObject } from 'react';

/**
 * Focuses `ref`'s element whenever `key` changes to a non-null value — built
 * for a list-to-detail drill-down (Assets/CorpAssets' station/container
 * level, Market Browser's item panel) where the control the pilot activated
 * (a location link, a tree row) unmounts or hides on the same render that
 * swaps the content in. Without this, focus falls back to `<body>` and a
 * keyboard/screen-reader user gets no cue what just happened (WCAG 2.4.3).
 *
 * Never fires on mount, only on a later change: `prevKey` is seeded with the
 * *current* `key` via `useRef`'s lazy initial value, so the first effect run
 * always sees `prevKey.current === key` and skips. A plain "have I run
 * before" boolean would work for a normal remount but not for React 18
 * StrictMode's dev-only mount→unmount→mount, which re-invokes this effect —
 * seeding from the key itself, not a flag, keeps that replay a no-op too.
 *
 * `key === null` is the explicit "don't focus" state (e.g. Market's item
 * panel while nothing is selected) — going *to* null never focuses, so a
 * Back-style transition that clears the target doesn't chase a heading that
 * just disappeared.
 *
 * `enabled` (default `true`) is for a caller that only wants this in a
 * narrow/mobile layout, e.g. `useFocusHeading(ref, selectedTypeId,
 * !isDesktop)`. This is deliberately a separate parameter rather than folded
 * into `key` (e.g. `isDesktop ? null : selectedTypeId`): `isDesktop` itself
 * flips at runtime on a plain window resize/rotation, independent of any
 * selection. Folding it into `key` would read that resize as "the key
 * changed to a new value" — indistinguishable from a real selection — and
 * steal focus the pilot never asked to move. `prevKey` is still updated
 * every run regardless of `enabled`, so a resize while disabled doesn't
 * leave a stale comparison that fires once `enabled` turns back on.
 */
export function useFocusHeading(
  ref: RefObject<HTMLElement | null>,
  key: unknown,
  enabled = true
): void {
  const prevKey = useRef(key);
  useEffect(() => {
    if (enabled && prevKey.current !== key && key !== null) {
      ref.current?.focus();
    }
    prevKey.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref is a stable identity from the caller's own useRef; only key/enabled should retrigger this
  }, [key, enabled]);
}
