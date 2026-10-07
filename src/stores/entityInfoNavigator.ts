/**
 * The seam between the modal stores and the router. `EntityInfoRoute` (mounted
 * once in `App.tsx`) registers a navigator here; while one is registered, the
 * stores' `open`/`close` move the URL's `info` param instead of setting state,
 * so every programmatic open — a menu's "Show info", the command palette, a
 * drill-down inside a modal — is the same history entry a link click makes.
 * With none registered (a unit test that renders a modal alone) the stores
 * fall back to setting their request directly.
 */
import type { EntityInfoTarget } from '@/lib/entityInfo';

export interface EntityInfoNavigator {
  open: (target: EntityInfoTarget) => void;
  close: () => void;
}

let current: EntityInfoNavigator | null = null;

export function registerEntityInfoNavigator(navigator: EntityInfoNavigator): () => void {
  current = navigator;
  return () => {
    if (current === navigator) current = null;
  };
}

export function getEntityInfoNavigator(): EntityInfoNavigator | null {
  return current;
}
