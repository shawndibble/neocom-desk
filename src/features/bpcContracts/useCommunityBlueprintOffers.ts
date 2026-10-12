/**
 * BPC Sourcing's Community source (issue #3602): the Shared Blueprints of
 * every Community the Character is in (at most 10), merged to one row per
 * sharer and instance (`buildCommunityOffers`). Loaded once per Character,
 * not per search; the panel narrows what is shown. Best-effort like the LP
 * source: no sync, no network or no Communities is no rows, never an error.
 */
import { useEffect, useState } from 'react';
import {
  buildCommunityOffers,
  type CommunityOfferSource,
} from '@/engine/communities/communityOffers';
import { communityOfferToSearchRow, type BpcSearchRow } from '@/engine/contracts/bpcSearch';
import {
  loadCommunityMembers,
  loadMemberLibraries,
  loadMyCommunities,
} from '@/features/communities/communityStore';
import { uidForCharacter } from '@/sync/uid';

const NONE: readonly BpcSearchRow[] = [];

async function loadCommunityOfferRows(characterId: number): Promise<readonly BpcSearchRow[]> {
  const communities = await loadMyCommunities(characterId);
  const sources: CommunityOfferSource[] = await Promise.all(
    communities.map(async (community) => {
      try {
        const members = await loadCommunityMembers(characterId, community.id);
        const libraries = await loadMemberLibraries(
          characterId,
          community.id,
          members.map((member) => member.uid)
        );
        const itemsByUid = new Map(libraries.map((library) => [library.uid, library.items]));
        return {
          communityName: community.name,
          members: members.map((member) => ({
            uid: member.uid,
            characterName: member.characterName,
            asOf: member.libraryAsOf,
            items: itemsByUid.get(member.uid) ?? [],
          })),
        };
      } catch {
        // One unreadable Community must not blank the others.
        return { communityName: community.name, members: [] };
      }
    })
  );
  // The Character's own library is its Owned rows already.
  return buildCommunityOffers(sources, Date.now(), new Set([uidForCharacter(characterId)])).map(
    communityOfferToSearchRow
  );
}

export function useCommunityBlueprintOffers({
  characterId,
  enabled,
}: {
  characterId: number | null;
  enabled: boolean;
}): { rows: readonly BpcSearchRow[]; loading: boolean } {
  const [state, setState] = useState<{ key: number; rows: readonly BpcSearchRow[] } | null>(null);
  const active = enabled && characterId !== null;

  useEffect(() => {
    if (!active || characterId === null) return;
    let cancelled = false;
    void (async () => {
      const rows = await loadCommunityOfferRows(characterId).catch(() => NONE);
      if (!cancelled) setState({ key: characterId, rows });
    })();
    return () => {
      cancelled = true;
    };
  }, [active, characterId]);

  if (!active) return { rows: NONE, loading: false };
  return state?.key === characterId
    ? { rows: state.rows, loading: false }
    : { rows: NONE, loading: true };
}
