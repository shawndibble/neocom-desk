import { useEffect, useMemo, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import {
  adoptGameBaseline,
  effectiveCurrentSystem,
  jumpRangeSystems,
  type CurrentSystem,
  type JumpRange,
  type PickedSystem,
} from '@/engine/route/jumpRange';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { localJumpDistances } from '@/features/route/localRoute';
import { useJumpBasis } from '@/features/route/jumpBasis';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { useActiveCharacter } from '@/stores/activeCharacter';

type PickedSystems = Record<string, PickedSystem>;

function isPickedSystem(raw: unknown): raw is PickedSystem {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.systemId === 'number' &&
    (r.gameSystemId === null || typeof r.gameSystemId === 'number')
  );
}

export const usePickedSystems = createLocalSetting<PickedSystems>({
  key: 'currentSystemPicks',
  defaultValue: {},
  parse: (raw) => {
    if (typeof raw !== 'object' || raw === null) return null;
    return Object.fromEntries(Object.entries(raw).filter(([, value]) => isPickedSystem(value)));
  },
});

export interface CurrentSystemState extends CurrentSystem {
  loaded: boolean;
  pick: (systemId: number) => void;
  clearPick: () => void;
}

export function useCurrentSystem(): CurrentSystemState {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const picks = usePickedSystems((state) => state.value);
  const picksHydrated = useHydratedStore(usePickedSystems);
  const setPicks = usePickedSystems((state) => state.setValue);
  const [game, setGame] = useState<{ characterId: number; systemId: number | null } | null>(null);

  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    void loadCharacterSolarSystemId(characterId)
      .catch(() => null)
      .then((systemId) => {
        if (!cancelled) setGame({ characterId, systemId });
      });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const gameSystemId = game?.characterId === characterId ? game.systemId : null;
  const picked = characterId === null ? null : (picks[String(characterId)] ?? null);
  const current = effectiveCurrentSystem(gameSystemId, picked);

  useEffect(() => {
    if (characterId === null) return;
    const adopted = adoptGameBaseline(picked, gameSystemId);
    if (adopted !== null) void setPicks({ ...picks, [String(characterId)]: adopted });
  }, [characterId, picked, gameSystemId, picks, setPicks]);

  return {
    ...current,
    loaded: picksHydrated && (characterId === null || game?.characterId === characterId),
    pick: (systemId) => {
      if (characterId === null) return;
      void setPicks({ ...picks, [String(characterId)]: { systemId, gameSystemId } });
    },
    clearPick: () => {
      if (characterId === null) return;
      const rest = { ...picks };
      delete rest[String(characterId)];
      void setPicks(rest);
    },
  };
}

export async function loadCurrentSystemId(
  characterId: number,
  staleAfterMs?: number
): Promise<number | null> {
  const [gameSystemId] = await Promise.all([
    loadCharacterSolarSystemId(characterId, staleAfterMs).catch(() => null),
    usePickedSystems.getState().hydrate(),
  ]);
  const picked = usePickedSystems.getState().value[String(characterId)] ?? null;
  return effectiveCurrentSystem(gameSystemId, picked).systemId;
}

export type JumpRangeStatus = 'off' | 'no-origin' | 'loading' | 'unknown' | 'ready';

export type JumpDistanceStatus = 'no-origin' | 'loading' | 'unknown' | 'ready';

export type JumpsCellValue =
  | { kind: 'loading' }
  | { kind: 'no-origin' }
  | { kind: 'unknown' }
  | { kind: 'value'; count: number | null };

export interface JumpRangeFilter {
  status: JumpRangeStatus;
  allowed: ReadonlySet<number> | null;
  jumps: ReadonlyMap<number, number> | null;
  jumpsStatus: JumpDistanceStatus;
}

export function useJumpRangeFilter(
  current: Pick<CurrentSystemState, 'systemId' | 'loaded'>,
  range: JumpRange
): JumpRangeFilter {
  const originSystemId = current.systemId;
  const { rules, network, key: routeKey, hydrated } = useJumpBasis();
  const [distances, setDistances] = useState<{
    origin: number;
    routeKey: string;
    jumps: ReadonlyMap<number, number> | null;
  } | null>(null);

  useEffect(() => {
    if (originSystemId === null || !hydrated) return;
    let cancelled = false;
    void localJumpDistances(originSystemId, rules, network).then((result) => {
      if (cancelled) return;
      setDistances({
        origin: originSystemId,
        routeKey,
        jumps: result.kind === 'known' ? result.jumps : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [originSystemId, rules, network, routeKey, hydrated]);

  const settled = distances?.origin === originSystemId && distances.routeKey === routeKey;
  const jumps = settled ? distances.jumps : null;

  const jumpsStatus = useMemo((): JumpDistanceStatus => {
    if (!current.loaded) return 'loading';
    if (originSystemId === null) return 'no-origin';
    if (!settled) return 'loading';
    if (distances.jumps === null) return 'unknown';
    return 'ready';
  }, [current.loaded, originSystemId, settled, distances]);

  return useMemo((): JumpRangeFilter => {
    if (range === 'any') return { status: 'off', allowed: null, jumps, jumpsStatus };
    if (jumpsStatus !== 'ready') {
      return { status: jumpsStatus, allowed: null, jumps, jumpsStatus };
    }
    return {
      status: 'ready',
      allowed: jumpRangeSystems(distances?.jumps ?? new Map(), range),
      jumps,
      jumpsStatus,
    };
  }, [range, jumps, jumpsStatus, distances]);
}
