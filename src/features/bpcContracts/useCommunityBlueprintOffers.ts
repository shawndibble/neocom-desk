import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import {
  buildCommunityOffers,
  type CommunityOfferSource,
} from '@/engine/communities/communityOffers';
import { communityOfferToSearchRow, type BpcSearchRow } from '@/engine/contracts/bpcSearch';
import {
  isRefused,
  loadCommunityMembersCached,
  loadMemberLibrariesFor,
  withMyCommunities,
  type CommunitySummary,
} from '@/features/communities/communityStore';
import { loadSolarSystemsByName } from '@/sde/solarSystems';
import { uidForCharacter } from '@/sync/uid';

const NONE: readonly BpcSearchRow[] = [];

async function offerSource(
  characterId: number,
  community: CommunitySummary,
  retried: boolean
): Promise<CommunityOfferSource> {
  try {
    const members = await loadCommunityMembersCached(characterId, community.id);
    const { libraries } = await loadMemberLibrariesFor(characterId, community.id, members);
    const itemsByUid = new Map(libraries.map((library) => [library.uid, library.items]));
    return {
      communityId: community.id,
      communityName: community.name,
      members: members.map((member) => ({
        uid: member.uid,
        characterName: member.characterName,
        asOf: member.libraryAsOf,
        items: itemsByUid.get(member.uid) ?? [],
      })),
    };
  } catch (err) {
    if (isRefused(err) && !retried) throw err;
    return { communityId: community.id, communityName: community.name, members: [] };
  }
}

async function loadCommunityOfferRows(characterId: number): Promise<readonly BpcSearchRow[]> {
  const sources: CommunityOfferSource[] = await withMyCommunities(
    characterId,
    (communities, { retried }) =>
      Promise.all(communities.map((community) => offerSource(characterId, community, retried)))
  );
  const byName = await loadSolarSystemsByName();
  return buildCommunityOffers(sources, Date.now(), new Set([uidForCharacter(characterId)])).map(
    (offer) => communityOfferToSearchRow(offer, byName?.get(offer.systemName.toLowerCase()))
  );
}

export function useCommunityBlueprintOffers({
  characterId,
  enabled,
}: {
  characterId: number | null;
  enabled: boolean;
}): { rows: readonly BpcSearchRow[]; loading: boolean } {
  const active = enabled && characterId !== null;
  const load = useCallback(
    () => loadCommunityOfferRows(characterId ?? 0).catch(() => NONE),
    [characterId]
  );
  const loaded = useKeyedLoad(active ? String(characterId) : null, load);

  if (!active) return { rows: NONE, loading: false };
  return loaded.status === 'ready'
    ? { rows: loaded.data, loading: false }
    : { rows: NONE, loading: true };
}
