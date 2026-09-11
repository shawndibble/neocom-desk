/**
 * The active Character's corporation as a second blueprint-ownership source
 * (issue #839): folded into the same per-plan "Corp Assets" toggle
 * (`plan.includeCorpAssets`) `corpOwnedStock.ts` already uses, so a
 * corp-owned copy counts as owned for Blueprint Acquisition's tier-selection
 * exactly like a personal one.
 *
 * Same shape and loading rule as `useCorpOwnedStockSource`: call once, above
 * whatever remount boundary switches the open Build Plan, and re-resolve
 * whenever the active Character (and so, possibly, its corporation) changes.
 * `CorporationBlueprint` mirrors `CharacterBlueprint` field-for-field, so the
 * adapted list can be concatenated straight onto `ownedBlueprints` with no
 * further translation.
 */
import { useEffect, useState } from 'react';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { loadCorporationBlueprints } from '@/features/corp/blueprints';
import { useActiveCorporationId } from '@/features/corp/owner';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useActiveCharacter } from '@/stores/activeCharacter';

export interface CorpOwnedBlueprintsState {
  /** Empty while unavailable, still loading, or the read failed outright. */
  blueprints: readonly CharacterBlueprint[];
  /**
   * Whether the active Character can read corp blueprints at all — gates
   * whether this source ever contributes, independent of whether it
   * currently has anything loaded.
   */
  available: boolean;
  /** The corp's blueprint list was capped or missing pages. */
  incomplete: boolean;
}

const UNAVAILABLE: CorpOwnedBlueprintsState = {
  blueprints: [],
  available: false,
  incomplete: false,
};

/** A fetched result, tagged with who it's for — see the guard in the memo below. */
interface TaggedResult {
  characterId: number;
  corporationId: number;
  blueprints: readonly CharacterBlueprint[];
  incomplete: boolean;
}

/** Call once, above whatever remount boundary switches the open Build Plan — same rule as `useCorpOwnedStockSource`. */
export function useCorpOwnedBlueprints(): CorpOwnedBlueprintsState {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const access = useCorpAccess();
  const canReadBlueprints = access.state === 'ready' && access.capabilities.canReadBlueprints;
  const [tagged, setTagged] = useState<TaggedResult | null>(null);

  const available = canReadBlueprints && activeCharacterId !== null && corporationId !== null;

  useEffect(() => {
    if (!available || activeCharacterId === null || corporationId === null) return;
    let cancelled = false;
    // A read that cannot complete is simply no corp contribution, the same
    // way a failed personal Character read is elsewhere in this feature —
    // detection degrades rather than erroring.
    void loadCorporationBlueprints(activeCharacterId, corporationId).then(
      (loaded) => {
        if (!cancelled) {
          setTagged({
            characterId: activeCharacterId,
            corporationId,
            blueprints: loaded.cached?.data ?? [],
            incomplete: loaded.cached?.truncated ?? false,
          });
        }
      },
      () => {
        if (!cancelled) {
          setTagged({
            characterId: activeCharacterId,
            corporationId,
            blueprints: [],
            incomplete: false,
          });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [available, activeCharacterId, corporationId]);

  if (!available) return UNAVAILABLE;

  // Guards against a stale result from the previous Character/corporation
  // still being in state the instant the new one becomes available — the
  // effect above has already been re-fired and its result isn't in yet.
  const result =
    tagged !== null &&
    tagged.characterId === activeCharacterId &&
    tagged.corporationId === corporationId
      ? tagged
      : null;

  return {
    blueprints: result?.blueprints ?? [],
    available: true,
    incomplete: result?.incomplete ?? false,
  };
}
