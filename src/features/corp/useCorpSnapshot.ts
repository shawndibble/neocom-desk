import { useCallback, useEffect, useRef, useState } from 'react';
import { invalidateFreshness } from '@/esi/cache';
import {
  readRouteSnapshot,
  routeSnapshotEpoch,
  writeRouteSnapshot,
} from '@/lib/routeSnapshotCache';
import { useRouteSnapshotHydration } from '@/lib/useRouteSnapshotHydration';

export interface CorpSnapshotOptions {
  name?: string;
  characterId?: number | null;
}

export interface CorpSnapshot<T> {
  data: T | null;
  loading: boolean;
  refreshCount: number;
  refresh: () => void;
}

interface Lifecycle {
  key: string | null;
  epoch: number;
  refreshCount: number;
}

export function useCorpSnapshot<T>(
  key: string | null,
  load: () => Promise<T>,
  options?: CorpSnapshotOptions
): CorpSnapshot<T> {
  const { name, characterId = null } = options ?? {};
  const retainAs = name !== undefined && key !== null ? `${name}|${key}` : null;
  const [lifecycle, setLifecycle] = useState<Lifecycle>({ key, epoch: 0, refreshCount: 0 });
  const [snapshot, setSnapshot] = useState<{ epoch: number; data: T | null } | null>(null);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  if (lifecycle.key !== key) {
    setLifecycle({ key, epoch: lifecycle.epoch + 1, refreshCount: 0 });
  }

  const { key: activeKey, epoch } = lifecycle;
  useEffect(() => {
    if (activeKey === null) return;
    let cancelled = false;
    const startedAt = characterId === null ? undefined : routeSnapshotEpoch(characterId);
    void (async () => {
      try {
        const data = await loadRef.current();
        if (!cancelled) {
          setSnapshot({ epoch, data });
          if (retainAs !== null && characterId !== null) {
            writeRouteSnapshot(retainAs, characterId, data, { startedAt });
          }
        }
      } catch {
        if (!cancelled) setSnapshot({ epoch, data: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeKey, epoch, retainAs, characterId]);

  const current = snapshot?.epoch === epoch ? snapshot : null;
  const retained =
    retainAs !== null && characterId !== null ? readRouteSnapshot<T>(retainAs, characterId) : null;
  useRouteSnapshotHydration(
    characterId,
    retainAs !== null && retained === null && current === null
  );

  return {
    data: current?.data ?? retained,
    loading: activeKey !== null && current === null,
    refreshCount: lifecycle.refreshCount,
    refresh: useCallback(() => {
      invalidateFreshness();
      setLifecycle((state) => ({
        ...state,
        epoch: state.epoch + 1,
        refreshCount: state.refreshCount + 1,
      }));
    }, []),
  };
}
