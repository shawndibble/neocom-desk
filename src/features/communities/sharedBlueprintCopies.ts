import type { MemberLibrary } from '@/engine/communities/libraryMatrix';
import type { CommunityMember } from './communityStore';

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
  runs: number;
}

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

export function placeNamesSystem(locationName: string, systemName: string): boolean {
  const name = locationName.toLowerCase();
  const system = systemName.toLowerCase();
  if (!name.startsWith(system)) return false;
  const rest = name.slice(system.length);
  return rest === '' || rest.startsWith(' ');
}

export function systemIdsByName(
  systems: Iterable<{ id: number; name: string }>
): Map<string, number> {
  const ids = new Map<string, number>();
  for (const system of systems) ids.set(system.name.toLowerCase(), system.id);
  return ids;
}
