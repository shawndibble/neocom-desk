import type { MemberLibrary } from '@/engine/communities/libraryMatrix';
import type { CommunityMember } from './communityStore';

/** One shared blueprint, as one Member shares it. */
export interface SharedBlueprintRow {
  key: string;
  typeId: number;
  name: string;
  memberName: string;
  stale: boolean;
  locationName: string;
  systemName: string;
  me: number;
  te: number;
  /** -1 for a BPO, else the BPC's runs left. */
  runs: number;
}

/**
 * Every Member's Shared Blueprints as rows, one per shared item, named from
 * the catalog. A query narrows by blueprint, Member, station or system.
 */
export function sharedBlueprintRows(
  libraries: readonly MemberLibrary[],
  members: readonly CommunityMember[],
  names: ReadonlyMap<number, string>,
  staleUids: ReadonlySet<string>,
  query: string
): SharedBlueprintRow[] {
  const memberName = new Map(members.map((member) => [member.uid, member.characterName]));
  const needle = query.trim().toLowerCase();
  const rows: SharedBlueprintRow[] = [];
  for (const library of libraries) {
    const owner = memberName.get(library.uid);
    // A library whose Member is no longer listed is not the Community's any more.
    if (owner === undefined) continue;
    library.items.forEach((item, index) => {
      const row: SharedBlueprintRow = {
        key: `${library.uid}:${index}`,
        typeId: item.typeId,
        name: names.get(item.typeId) ?? `#${item.typeId}`,
        memberName: owner,
        stale: staleUids.has(library.uid),
        locationName: item.locationName,
        systemName: item.systemName,
        me: item.me,
        te: item.te,
        runs: item.runs,
      };
      if (
        needle === '' ||
        [row.name, row.memberName, row.locationName, row.systemName].some((text) =>
          text.toLowerCase().includes(needle)
        )
      ) {
        rows.push(row);
      }
    });
  }
  return rows;
}
