import type { EntityInfoTarget } from '@/lib/entityInfo';

export interface EntityInfoNavigator {
  open: (target: EntityInfoTarget) => void;
  close: () => void;
  setTab: (tab: string | null) => void;
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
