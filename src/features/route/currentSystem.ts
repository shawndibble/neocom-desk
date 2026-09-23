/**
 * Current System: where the active Character is, as the Jump Range filter
 * measures it. ESI's location by default (`character/location.ts`), or a
 * system the pilot picked by hand — see `effectiveCurrentSystem` for when a
 * pick stops applying.
 *
 * Picks are a device-local setting keyed by Character, never synced: a
 * location is about this session, not a preference to carry across devices.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  effectiveCurrentSystem,
  jumpRangeSystems,
  type CurrentSystem,
  type JumpRange,
  type PickedSystem,
} from '@/engine/route/jumpRange';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { localJumpDistances } from '@/features/route/localRoute';
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
  /** False until both the game location and the stored pick have been read. */
  loaded: boolean;
  pick: (systemId: number) => void;
  /** Back to the game location. */
  clearPick: () => void;
}

export function useCurrentSystem(): CurrentSystemState {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const picks = usePickedSystems((state) => state.value);
  const picksHydrated = usePickedSystems((state) => state.hydrated);
  const hydratePicks = usePickedSystems((state) => state.hydrate);
  const setPicks = usePickedSystems((state) => state.setValue);
  const [game, setGame] = useState<{ characterId: number; systemId: number | null } | null>(null);

  useEffect(() => {
    void hydratePicks();
  }, [hydratePicks]);

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

/**
 * What a Jump Range filter can do right now:
 * - `off`: range is Any, nothing to filter;
 * - `no-origin`: no Current System to measure from;
 * - `loading`: distances not computed yet;
 * - `unknown`: the stargate snapshot could not be read;
 * - `ready`: `allowed` is the systems in range.
 *
 * Only `ready` restricts. The others pass every row, so a missing location or
 * an offline first visit never reads as "nothing within 5 jumps".
 */
export type JumpRangeStatus = 'off' | 'no-origin' | 'loading' | 'unknown' | 'ready';

export interface JumpRangeFilter {
  status: JumpRangeStatus;
  allowed: ReadonlySet<number> | null;
}

export function useJumpRangeFilter(
  current: Pick<CurrentSystemState, 'systemId' | 'loaded'>,
  range: JumpRange
): JumpRangeFilter {
  const originSystemId = current.systemId;
  const [distances, setDistances] = useState<{
    origin: number;
    jumps: ReadonlyMap<number, number> | null;
  } | null>(null);

  const needed = range !== 'any' && originSystemId !== null;

  useEffect(() => {
    if (!needed || originSystemId === null) return;
    let cancelled = false;
    void localJumpDistances(originSystemId).then((result) => {
      if (cancelled) return;
      setDistances({
        origin: originSystemId,
        jumps: result.kind === 'known' ? result.jumps : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [needed, originSystemId]);

  return useMemo((): JumpRangeFilter => {
    if (range === 'any') return { status: 'off', allowed: null };
    // Still reading ESI: "no system" now would flash the set-your-system note.
    if (!current.loaded) return { status: 'loading', allowed: null };
    if (originSystemId === null) return { status: 'no-origin', allowed: null };
    if (distances?.origin !== originSystemId) return { status: 'loading', allowed: null };
    if (distances.jumps === null) return { status: 'unknown', allowed: null };
    return { status: 'ready', allowed: jumpRangeSystems(distances.jumps, range) };
  }, [range, current.loaded, originSystemId, distances]);
}
