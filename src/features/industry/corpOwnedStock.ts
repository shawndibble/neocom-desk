/**
 * The active Character's corporation as a second owned-stock source (issue
 * #798): a "Corp Assets" toggle on a Build Plan folds the corp's hangars in
 * alongside the existing all-account personal detection, when the active
 * Character can read them (corp Director only — `canReadAssets`).
 *
 * Kept out of `useDetectedOwnedStock.ts`'s `useOwnedStockSnapshot` on
 * purpose: that hook loads once, above `BuildPlanDetail`'s `key={plan.id}`
 * remount boundary, because personal detection pools every authenticated
 * Character regardless of which plan is open. Corp scope is different — it
 * has to re-resolve whenever the *active* Character (and so, possibly, its
 * corporation) changes, not when the open plan changes — so it gets its own
 * hook, loaded independently above the same boundary in `Industry.tsx` and
 * merged into `detectOwnedStock`'s input only for a plan whose own
 * `includeCorpAssets` flag is on.
 */
import { useEffect, useState } from 'react';
import type { OwnedStockSource } from '@/engine/industry/ownedStock';
import { loadCorporationAssets } from '@/features/corp/assets';
import { useActiveCorporationId } from '@/features/corp/owner';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';

export interface CorpOwnedStockResult {
  source: OwnedStockSource;
  /** The corp's asset list was capped or missing pages — its contribution is a floor, not exact. */
  truncated: boolean;
}

/**
 * The active Character's corporation's assets as an owned-stock source, or
 * `null` when the read failed outright (offline, or nothing cached yet) —
 * distinct from an empty hangar, which is a real, present source with no
 * assets in it.
 */
export async function loadCorpOwnedStockSource(
  characterId: number,
  corporationId: number
): Promise<CorpOwnedStockResult | null> {
  const { cached } = await loadCorporationAssets(characterId, corporationId);
  if (!cached) return null;
  return {
    source: { characterId, corporationId, assets: cached.data },
    truncated: cached.truncated,
  };
}

export interface CorpOwnedStockState {
  /** `null` while unavailable, still loading, or the read failed outright. */
  source: OwnedStockSource | null;
  corporationId: number | null;
  corporationName: string | null;
  /**
   * Whether the active Character can read corp assets at all — gates the
   * Build Plan's "Corp Assets" toggle itself, not just whether a source is
   * currently in hand.
   */
  available: boolean;
  /** The corp's asset list was capped or missing pages. */
  incomplete: boolean;
}

const UNAVAILABLE: CorpOwnedStockState = {
  source: null,
  corporationId: null,
  corporationName: null,
  available: false,
  incomplete: false,
};

/** A fetched result, tagged with who it's for — see the guard in the memo below. */
interface TaggedResult {
  characterId: number;
  corporationId: number;
  result: CorpOwnedStockResult | null;
}

/**
 * Call once, above whatever remount boundary switches the open Build Plan —
 * same rule as `useOwnedStockSnapshot`. Re-resolves whenever the active
 * Character (or its corporation) changes; `loadCorporationAssets` is
 * cache-first, so that re-resolution is cheap.
 */
export function useCorpOwnedStockSource(): CorpOwnedStockState {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const access = useCorpAccess();
  const canReadAssets = access.state === 'ready' && access.capabilities.canReadAssets;
  const loadPublicInfo = usePublicInfo((state) => state.load);
  const corporationName = usePublicInfo((state) =>
    activeCharacterId === null
      ? null
      : (state.byCharacterId[activeCharacterId]?.corporationName ?? null)
  );
  const [tagged, setTagged] = useState<TaggedResult | null>(null);

  const available = canReadAssets && activeCharacterId !== null && corporationId !== null;

  useEffect(() => {
    if (activeCharacterId !== null) void loadPublicInfo(activeCharacterId);
  }, [activeCharacterId, loadPublicInfo]);

  useEffect(() => {
    if (!available || activeCharacterId === null || corporationId === null) return;
    let cancelled = false;
    // A read that cannot complete is simply no corp contribution, the same
    // way a failed personal Character read is in `loadOwnedStockSnapshot` —
    // detection degrades rather than erroring.
    void loadCorpOwnedStockSource(activeCharacterId, corporationId).then(
      (loaded) => {
        if (!cancelled)
          setTagged({ characterId: activeCharacterId, corporationId, result: loaded });
      },
      () => {
        if (!cancelled) setTagged({ characterId: activeCharacterId, corporationId, result: null });
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
      ? tagged.result
      : null;

  return {
    source: result?.source ?? null,
    corporationId,
    corporationName,
    available: true,
    incomplete: result?.truncated ?? false,
  };
}
