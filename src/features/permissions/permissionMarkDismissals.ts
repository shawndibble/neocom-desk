import { useCallback, useEffect } from 'react';
import type { PermissionCellMarkStatus } from '@/components/ui/PermissionCellMark';
import type { ScopeGroup } from '@/esi/registry';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const PERMISSION_MARK_DISMISSALS_KEY = 'sync.permissionMarkDismissals';

export function parsePermissionMarkDismissals(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === 'string' && id !== ''))];
}

export function withDismissed(list: readonly string[], groups: readonly string[]): string[] {
  const add = groups.filter((group) => !list.includes(group));
  return add.length === 0 ? (list as string[]) : [...list, ...new Set(add)];
}

export function withoutDismissed(list: readonly string[], group: string): string[] {
  return list.includes(group) ? list.filter((g) => g !== group) : (list as string[]);
}

export function markStatus(
  missing: readonly ScopeGroup[],
  dismissed: readonly string[]
): { status: PermissionCellMarkStatus; asking: ScopeGroup[] } {
  if (missing.length === 0) return { status: 'granted', asking: [] };
  const asking = missing.filter((group) => !dismissed.includes(group));
  return { status: asking.length === 0 ? 'dismissed' : 'missing', asking };
}

export const usePermissionMarkDismissalsStore = createSyncedSetting<string[]>({
  key: PERMISSION_MARK_DISMISSALS_KEY,
  defaultValue: [],
  parse: parsePermissionMarkDismissals,
});

export interface UsePermissionMarkDismissals {
  dismissed: readonly string[];
  hydrated: boolean;
  dismiss: (groups: readonly ScopeGroup[]) => Promise<void>;
  askAgain: (group: ScopeGroup) => Promise<void>;
}

export function usePermissionMarkDismissals(): UsePermissionMarkDismissals {
  const dismissed = usePermissionMarkDismissalsStore((s) => s.value);
  const hydrated = usePermissionMarkDismissalsStore((s) => s.hydrated);
  const setValue = usePermissionMarkDismissalsStore((s) => s.setValue);
  useEffect(() => {
    void usePermissionMarkDismissalsStore.getState().hydrate();
  }, []);
  const apply = useCallback(
    (fn: (list: readonly string[]) => string[]) => {
      const current = usePermissionMarkDismissalsStore.getState().value;
      const next = fn(current);
      return next === current ? Promise.resolve() : setValue(next);
    },
    [setValue]
  );
  return {
    dismissed,
    hydrated,
    dismiss: useCallback((groups) => apply((list) => withDismissed(list, groups)), [apply]),
    askAgain: useCallback((group) => apply((list) => withoutDismissed(list, group)), [apply]),
  };
}
