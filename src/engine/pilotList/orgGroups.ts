export interface OrgMember {
  corporationId: number | null;
  corporationName: string | null;
  allianceId: number | null;
  allianceName: string | null;
}

export interface CorporationGroup<T> {
  id: number;
  name: string | null;
  rows: T[];
}

export interface AllianceSection<T> {
  kind: 'alliance';
  id: number;
  name: string | null;
  rows: T[];
  corporations: CorporationGroup<T>[];
}

export interface CorporationSection<T> {
  kind: 'corporation';
  id: number;
  name: string | null;
  alliance: { id: number; name: string | null } | null;
  rows: T[];
}

export type OrgSection<T> = AllianceSection<T> | CorporationSection<T>;

export interface OrgGrouping<T> {
  sections: OrgSection<T>[];
  alone: T[];
  unplaced: T[];
}

function bySizeThenName<G extends { id: number; name: string | null; rows: unknown[] }>(
  a: G,
  b: G
): number {
  if (a.rows.length !== b.rows.length) return b.rows.length - a.rows.length;
  if (a.name !== null && b.name !== null) return a.name.localeCompare(b.name);
  if (a.name !== b.name) return a.name === null ? 1 : -1;
  return a.id - b.id;
}

function corporationsOf<T extends OrgMember>(rows: readonly T[]): CorporationGroup<T>[] {
  const byId = new Map<number, CorporationGroup<T>>();
  for (const row of rows) {
    if (row.corporationId === null) continue;
    const group = byId.get(row.corporationId) ?? {
      id: row.corporationId,
      name: row.corporationName,
      rows: [],
    };
    group.rows.push(row);
    byId.set(row.corporationId, group);
  }
  return [...byId.values()].sort(bySizeThenName);
}

export function groupByOrganization<T extends OrgMember>(rows: readonly T[]): OrgGrouping<T> {
  const alliances = new Map<number, T[]>();
  const corporations = new Map<number, T[]>();
  const unplaced: T[] = [];
  const add = (map: Map<number, T[]>, id: number, row: T) => {
    const list = map.get(id);
    if (list === undefined) map.set(id, [row]);
    else list.push(row);
  };
  for (const row of rows) {
    if (row.corporationId === null) unplaced.push(row);
    else if (row.allianceId !== null) add(alliances, row.allianceId, row);
    else add(corporations, row.corporationId, row);
  }

  const sections: OrgSection<T>[] = [];
  const alone: T[] = [];
  for (const [id, members] of alliances) {
    if (members.length === 1) {
      alone.push(members[0]);
      continue;
    }
    const corps = corporationsOf(members);
    const allianceName = members[0].allianceName;
    sections.push(
      corps.length > 1
        ? { kind: 'alliance', id, name: allianceName, rows: members, corporations: corps }
        : {
            kind: 'corporation',
            id: corps[0].id,
            name: corps[0].name,
            alliance: { id, name: allianceName },
            rows: members,
          }
    );
  }
  for (const [id, members] of corporations) {
    if (members.length === 1) {
      alone.push(members[0]);
      continue;
    }
    sections.push({
      kind: 'corporation',
      id,
      name: members[0].corporationName,
      alliance: null,
      rows: members,
    });
  }
  sections.sort(bySizeThenName);
  const lone = new Set(alone);
  return { sections, alone: rows.filter((row) => lone.has(row)), unplaced };
}
