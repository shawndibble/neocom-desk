/**
 * Community Offers (issue #3602, ADR 0018): the Shared Blueprints of every
 * Community a Character is in, merged for BPC Sourcing. One row per sharer
 * and blueprint instance however many Communities show it; a stale library
 * is flagged, never dropped. Pure: loading is `useCommunityBlueprintOffers`.
 */
import { isLibraryStale, type SharedBlueprint } from './sharedLibrary';

/** One Community's Members, each with their library and its "as of" stamp. */
export interface CommunityOfferSource {
  communityName: string;
  members: readonly {
    uid: string;
    characterName: string;
    /** When the Member's library was last refreshed; null when it shares none. */
    asOf: number | null;
    items: readonly SharedBlueprint[];
  }[];
}

export interface CommunityOffer extends SharedBlueprint {
  uid: string;
  memberName: string;
  /** Identical copies the sharer holds (the most any one Community lists). */
  quantity: number;
  /** Every Community that shows this instance, sorted by name. */
  communityNames: string[];
  asOf: number | null;
  stale: boolean;
}

function instanceKey(uid: string, b: SharedBlueprint): string {
  return JSON.stringify([uid, b.typeId, b.me, b.te, b.runs, b.locationName, b.systemName]);
}

export function buildCommunityOffers(
  sources: readonly CommunityOfferSource[],
  now: number,
  excludeUids: ReadonlySet<string> = new Set()
): CommunityOffer[] {
  const byKey = new Map<string, CommunityOffer>();
  for (const { communityName, members } of sources) {
    for (const member of members) {
      if (excludeUids.has(member.uid)) continue;
      const counts = new Map<string, { item: SharedBlueprint; count: number }>();
      for (const item of member.items) {
        const key = instanceKey(member.uid, item);
        const entry = counts.get(key);
        if (entry) entry.count += 1;
        else counts.set(key, { item, count: 1 });
      }
      for (const [key, { item, count }] of counts) {
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, {
            ...item,
            uid: member.uid,
            memberName: member.characterName,
            quantity: count,
            communityNames: [communityName],
            asOf: member.asOf,
            stale: isLibraryStale(member.asOf, now),
          });
          continue;
        }
        existing.quantity = Math.max(existing.quantity, count);
        if (!existing.communityNames.includes(communityName)) {
          existing.communityNames.push(communityName);
        }
        // The freshest stamp across Communities decides: one fresh view means it is current.
        if (member.asOf !== null && (existing.asOf === null || member.asOf > existing.asOf)) {
          existing.asOf = member.asOf;
          existing.stale = isLibraryStale(member.asOf, now);
        }
      }
    }
  }
  const offers = [...byKey.values()];
  for (const offer of offers) offer.communityNames.sort((a, b) => a.localeCompare(b));
  return offers.sort(
    (a, b) =>
      a.typeId - b.typeId ||
      a.memberName.localeCompare(b.memberName) ||
      a.runs - b.runs ||
      b.me - a.me
  );
}
