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

/**
 * Whether a station's or structure's name already says its system: an NPC
 * station's always starts with it ("Jita IV - Moon 4 - …") and an Upwell
 * structure's too ("Efa - Home"), so the Location cell prints the system
 * under the name only when it does not. The system must be a whole word at
 * the start: followed by the end, a space or " -".
 */
export function placeNamesSystem(locationName: string, systemName: string): boolean {
  const name = locationName.toLowerCase();
  const system = systemName.toLowerCase();
  if (!name.startsWith(system)) return false;
  // A whole word: "Jitanomics" does not name Jita. " -" starts with the space.
  const rest = name.slice(system.length);
  return rest === '' || rest.startsWith(' ');
}

/**
 * Solar system ids by lowercase name. A Shared Blueprint carries its system's
 * name only (never an id, ADR 0018), so the Jumps column finds the id here.
 */
export function systemIdsByName(
  systems: Iterable<{ id: number; name: string }>
): Map<string, number> {
  const ids = new Map<string, number>();
  for (const system of systems) ids.set(system.name.toLowerCase(), system.id);
  return ids;
}
