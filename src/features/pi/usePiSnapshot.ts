import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadGoalPlannerSnapshot, type GoalPlannerSnapshot } from './goalPlannerSnapshot';
import { markReRead } from './snapshotLineage';

export interface PiSnapshotState {
  snapshot: GoalPlannerSnapshot | null;
  failed: boolean;
  retrying: boolean;
  retry: () => void;
}

const SharedPiSnapshot = createContext<{ characterId: number; state: PiSnapshotState } | null>(
  null
);

export function PiSnapshotProvider({
  characterId,
  reloadKey = 0,
  children,
}: {
  characterId: number;
  reloadKey?: number;
  children: ReactNode;
}) {
  const state = useLoadedPiSnapshot(characterId, reloadKey);
  return createElement(SharedPiSnapshot.Provider, { value: { characterId, state } }, children);
}

export function usePiSnapshot(characterId: number | null, reloadKey = 0): PiSnapshotState {
  const shared = useContext(SharedPiSnapshot);
  const served = shared !== null && shared.characterId === characterId;
  const local = useLoadedPiSnapshot(served ? null : characterId, reloadKey);
  return served ? shared.state : local;
}

function useLoadedPiSnapshot(characterId: number | null, reloadKey: number): PiSnapshotState {
  const shown = useRef<{ characterId: number; snapshot: GoalPlannerSnapshot } | null>(null);
  const loader = useCallback(
    () =>
      loadGoalPlannerSnapshot(characterId as number).then((next) => {
        const previous = shown.current;
        if (previous?.characterId === characterId) markReRead(next, previous.snapshot);
        return next;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characterId, reloadKey]
  );
  const { status, data, retry: reload } = useKeyedLoad(characterId?.toString() ?? null, loader);
  const snapshot = data ?? null;
  useEffect(() => {
    shown.current = snapshot && characterId !== null ? { characterId, snapshot } : null;
  }, [characterId, snapshot]);
  const [retryFrom, setRetryFrom] = useState<GoalPlannerSnapshot | null>(null);
  const retrying = snapshot !== null && snapshot === retryFrom;
  const retry = useCallback(() => {
    setRetryFrom(snapshot);
    reload();
  }, [snapshot, reload]);
  return { snapshot, failed: status === 'failed', retrying, retry };
}
