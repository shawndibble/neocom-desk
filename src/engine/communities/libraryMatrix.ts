import type { SharedBlueprint } from './sharedLibrary';
import type { BlueprintTypeInfo } from './shareTree';

export interface MemberLibrary {
  uid: string;
  items: readonly SharedBlueprint[];
}

export interface LibraryHolder {
  uid: string;
  copies: number;
  hasOriginal: boolean;
}

export interface LibraryRow extends BlueprintTypeInfo {
  holders: LibraryHolder[];
}

export type LibraryFilter = 'missingCommunity' | 'ownedByMe' | 'missingFromMe';

export function buildLibraryRows(
  catalog: readonly BlueprintTypeInfo[],
  libraries: readonly MemberLibrary[]
): LibraryRow[] {
  const rows = new Map<number, LibraryRow>(
    catalog.map((type) => [type.typeId, { ...type, holders: [] }])
  );
  for (const library of libraries) {
    const held = new Map<number, LibraryHolder>();
    for (const item of library.items) {
      const row = rows.get(item.typeId);
      if (!row) continue;
      let holder = held.get(item.typeId);
      if (!holder) {
        holder = { uid: library.uid, copies: 0, hasOriginal: false };
        held.set(item.typeId, holder);
        row.holders.push(holder);
      }
      holder.copies += 1;
      if (item.runs === -1) holder.hasOriginal = true;
    }
  }
  return [...rows.values()];
}

export function filterLibraryRows(
  rows: readonly LibraryRow[],
  myUid: string,
  filter: LibraryFilter,
  query: string
): LibraryRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (needle && !row.name.toLowerCase().includes(needle)) return false;
    const mine = row.holders.some((holder) => holder.uid === myUid);
    switch (filter) {
      case 'missingCommunity':
        return row.holders.length === 0;
      case 'ownedByMe':
        return mine;
      case 'missingFromMe':
        return !mine && row.holders.length > 0;
    }
  });
}
