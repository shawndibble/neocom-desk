import { describe, it, expect } from 'vitest';
import { npcStandingsCsvColumns } from './npcStandingsCsv';
import type { NpcStandingRow } from './npcStandingsRows';

const t = (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k);

function row(overrides: Partial<NpcStandingRow> = {}): NpcStandingRow {
  return {
    id: 1,
    name: 'Caldari Navy',
    kind: 'corp',
    base: 5.5,
    effective: 6.1,
    belongsTo: { name: 'Caldari State' },
    accessLevel: 4,
    agentAccess: null,
    nearest: { stationId: 1, systemId: 2, jumps: 3 },
    usedForFees: true,
    ...overrides,
  };
}

const valuesOf = (r: NpcStandingRow) =>
  Object.fromEntries(npcStandingsCsvColumns(t).map((c) => [c.header, c.value(r)]));

describe('npcStandingsCsvColumns', () => {
  it('orders every column the table can show', () => {
    expect(npcStandingsCsvColumns(t).map((c) => c.header)).toEqual([
      'contacts.name',
      'contacts.type',
      'contacts.standings.columnBelongsTo',
      'contacts.standings.csvLevel',
      'contacts.standings.csvDivision',
      'contacts.standings.columnEffective',
      'contacts.standings.columnBase',
      'contacts.standings.columnAccess',
      'contacts.standings.csvAgentAccess',
      'contacts.standings.columnJumps',
      'contacts.standings.columnFees',
    ]);
  });

  it('exports a corporation row with raw standings, access level, jumps and the fee flag', () => {
    expect(valuesOf(row())).toMatchObject({
      'contacts.name': 'Caldari Navy',
      'contacts.type': 'contacts.standingsKind.corp',
      'contacts.standings.columnBelongsTo': 'Caldari State',
      'contacts.standings.columnEffective': 6.1,
      'contacts.standings.columnBase': 5.5,
      'contacts.standings.columnAccess': 4,
      'contacts.standings.csvAgentAccess': null,
      'contacts.standings.columnJumps': 3,
      'contacts.standings.columnFees': 'contacts.standings.fees',
    });
  });

  it('splits an agent into level, division and what is needed to use them', () => {
    const values = valuesOf(
      row({
        kind: 'agent',
        belongsTo: { name: 'Caldari Navy', level: 3, division: 'Security' },
        accessLevel: null,
        agentAccess: { open: false, blockedBy: null, needs: 3.5, short: 1 },
        usedForFees: false,
        nearest: null,
      })
    );
    expect(values).toMatchObject({
      'contacts.standings.csvLevel': 3,
      'contacts.standings.csvDivision': 'Security',
      'contacts.standings.columnAccess': 0,
      'contacts.standings.csvAgentAccess': 'contacts.standings.accessNeeds:{"standing":"3.50"}',
      'contacts.standings.columnJumps': undefined,
      'contacts.standings.columnFees': undefined,
    });
  });

  it('never invents an access value: unknown level or needed standing is blank', () => {
    const values = valuesOf(
      row({
        kind: 'agent',
        belongsTo: { name: 'Caldari Navy' },
        accessLevel: null,
        agentAccess: { open: true, blockedBy: null, needs: null, short: 0 },
      })
    );
    expect(values['contacts.standings.columnAccess']).toBeNull();
    const noNeed = valuesOf(
      row({ kind: 'agent', agentAccess: { open: false, blockedBy: null, needs: null, short: 0 } })
    );
    expect(noNeed['contacts.standings.csvAgentAccess']).toBeNull();
  });

  it('leaves standing blank when skills could not be read', () => {
    expect(valuesOf(row({ effective: null, accessLevel: null }))).toMatchObject({
      'contacts.standings.columnEffective': null,
      'contacts.standings.columnAccess': null,
    });
  });
});
