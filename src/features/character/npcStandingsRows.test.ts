import { describe, expect, it } from 'vitest';
import type { CharacterStandingEntry } from '@/engine/market/standings';
import {
  EVERY_NPC_STANDING,
  activeNpcStandingsFilterCount,
  NO_NPC_STANDINGS_REFERENCE,
  buildNpcStandingRows,
  countNpcStandingRows,
  feeOwnerIds,
  npcAccessLevel,
  npcAccessSortValue,
  npcAgentAccessText,
  filterNpcStandingRows,
  type NpcStandingRow,
  type NpcStandingsFilter,
  type NpcStandingsReference,
} from './npcStandingsRows';

const CALDARI = 500001;
const GURISTAS = 500010;
const NAVY = 1000035;
const ISHUKONE = 1000127;
const GURISTAS_CORP = 1000999;
const AGENT_L3 = 3009001;
const AGENT_L1 = 3009002;
const STORYLINE_AGENT = 3009777;

const entries: CharacterStandingEntry[] = [
  { from_id: CALDARI, from_type: 'faction', standing: 2.5 },
  { from_id: NAVY, from_type: 'npc_corp', standing: 5 },
  { from_id: ISHUKONE, from_type: 'npc_corp', standing: 1 },
  { from_id: AGENT_L3, from_type: 'agent', standing: 8 },
  { from_id: AGENT_L1, from_type: 'agent', standing: -3 },
  { from_id: STORYLINE_AGENT, from_type: 'agent', standing: 4 },
  { from_id: GURISTAS, from_type: 'faction', standing: -4 },
  { from_id: GURISTAS_CORP, from_type: 'npc_corp', standing: 1 },
];
const names = new Map([
  [CALDARI, 'Caldari State'],
  [NAVY, 'Caldari Navy'],
  [ISHUKONE, 'Ishukone Corporation'],
  [AGENT_L3, 'Hanna Kurosawa'],
  [STORYLINE_AGENT, 'Story Teller'],
]);
const owners = new Set([CALDARI, NAVY]);

const SKILLS = { connections: 5, criminalConnections: 0, diplomacy: 0 };
const UNTRAINED = { connections: 0, criminalConnections: 0, diplomacy: 0 };
const reference: NpcStandingsReference = {
  skills: SKILLS,
  corporations: {
    factions: new Map([
      [NAVY, CALDARI],
      [ISHUKONE, CALDARI],
      [GURISTAS_CORP, GURISTAS],
    ]),
    corporationName: (id) => ({ [NAVY]: 'Caldari Navy', [ISHUKONE]: 'Ishukone Corporation' })[id],
    factionName: (id) => ({ [CALDARI]: 'Caldari State', [GURISTAS]: 'Guristas Pirates' })[id],
  },
  agents: {
    agentById: (id) =>
      ({
        [AGENT_L3]: {
          id: AGENT_L3,
          name: 'Hanna Kurosawa',
          level: 3,
          divisionId: 24,
          corporationId: ISHUKONE,
          stationId: 1,
          isLocator: false,
        },
        [AGENT_L1]: {
          id: AGENT_L1,
          name: 'Level One',
          level: 1,
          divisionId: 18,
          corporationId: NAVY,
          stationId: 2,
          isLocator: false,
        },
      })[id],
    divisionName: (id) => ({ 24: 'Security', 18: 'Mining' })[id],
  },
  stations: [
    {
      id: 11,
      name: 'Navy far',
      systemId: 30000009,
      ownerCorporationId: NAVY,
      ownerFactionId: CALDARI,
    },
    {
      id: 12,
      name: 'Navy near',
      systemId: 30000002,
      ownerCorporationId: NAVY,
      ownerFactionId: CALDARI,
    },
    {
      id: 13,
      name: 'Ishukone',
      systemId: 30000001,
      ownerCorporationId: ISHUKONE,
      ownerFactionId: CALDARI,
    },
    // The level 3 agent's station
    {
      id: 1,
      name: 'Agent station',
      systemId: 30000003,
      ownerCorporationId: ISHUKONE,
      ownerFactionId: CALDARI,
    },
  ],
  jumps: new Map([
    [30000001, 0],
    [30000002, 4],
    [30000003, 7],
    [30000009, 12],
  ]),
};

const rows = buildNpcStandingRows(entries, names, owners, reference);
const row = (id: number, from: readonly NpcStandingRow[] = rows): NpcStandingRow => {
  const found = from.find((r) => r.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
};

describe('buildNpcStandingRows', () => {
  describe('nearest', () => {
    it("is a corporation's nearest station, and a faction's nearest of any of its corporations", () => {
      expect(row(NAVY).nearest).toEqual({ stationId: 12, systemId: 30000002, jumps: 4 });
      // Ishukone's station is in the current system: the faction's nearest is 0 jumps
      expect(row(CALDARI).nearest).toEqual({ stationId: 13, systemId: 30000001, jumps: 0 });
    });

    it('is the station an agent sits in, whatever else its corporation owns', () => {
      expect(row(AGENT_L3).nearest).toEqual({ stationId: 1, systemId: 30000003, jumps: 7 });
    });

    it('is unknown for an owner of no known station, an agent without one, or a faction that owns none', () => {
      expect(row(GURISTAS_CORP).nearest).toBeNull();
      expect(row(GURISTAS).nearest).toBeNull();
      expect(row(STORYLINE_AGENT).nearest).toBeNull();
      // The level 1 agent's station is not in the snapshot
      expect(row(AGENT_L1).nearest).toBeNull();
    });

    it('is unknown on every row when the distances or the stations could not be read', () => {
      for (const missing of [{ jumps: null }, { stations: null }] as const) {
        const unknown = buildNpcStandingRows(entries, names, owners, { ...reference, ...missing });
        expect(unknown.every((r) => r.nearest === null)).toBe(true);
      }
    });

    it('skips a station whose system is unreachable', () => {
      const cut = buildNpcStandingRows(entries, names, owners, {
        ...reference,
        jumps: new Map([[30000009, 12]]),
      });
      expect(row(NAVY, cut).nearest).toEqual({ stationId: 11, systemId: 30000009, jumps: 12 });
      expect(row(AGENT_L3, cut).nearest).toBeNull();
    });
  });

  it('maps the ESI kind to faction / corp / agent', () => {
    expect(row(CALDARI).kind).toBe('faction');
    expect(row(NAVY).kind).toBe('corp');
    expect(row(AGENT_L3).kind).toBe('agent');
  });

  it('flags only fee owner ids, by id', () => {
    expect(rows.filter((r) => r.usedForFees).map((r) => r.id)).toEqual([NAVY, CALDARI]);
  });

  it('orders by base standing descending', () => {
    expect(rows.map((r) => r.base)).toEqual([8, 5, 4, 2.5, 1, 1, -3, -4]);
  });

  it('names a row ESI did not resolve from the agents data, else #id', () => {
    expect(row(AGENT_L1).name).toBe('Level One');
    expect(row(GURISTAS).name).toBe('#500010');
  });

  it('is empty for no entries', () => {
    expect(buildNpcStandingRows([], names, owners, reference)).toEqual([]);
  });

  describe('belongs to', () => {
    it("is a corporation's faction", () => {
      expect(row(NAVY).belongsTo).toEqual({ name: 'Caldari State' });
    });

    it('is nothing for a faction', () => {
      expect(row(CALDARI).belongsTo).toBeNull();
    });

    it("is an agent's corporation with its level and division", () => {
      expect(row(AGENT_L3).belongsTo).toEqual({
        name: 'Ishukone Corporation',
        level: 3,
        division: 'Security',
      });
    });

    it('is nothing for an agent the agents data leaves out', () => {
      expect(row(STORYLINE_AGENT).belongsTo).toBeNull();
    });
  });

  describe('with skills', () => {
    it('lifts a positive standing by Connections', () => {
      // 5 + (10 - 5) * 0.04 * 5
      expect(row(NAVY).effective).toBeCloseTo(6, 10);
    });

    it("lifts a pirate corporation's positive standing by Criminal Connections, not Connections", () => {
      expect(row(GURISTAS_CORP).effective).toBe(1);
    });

    it('is null for an agent whose chain is unknown', () => {
      expect(row(STORYLINE_AGENT).effective).toBeNull();
    });

    it('is null on every row when skills are unknown, and so is access: base standing would understate it', () => {
      const unknown = buildNpcStandingRows(entries, names, owners, { ...reference, skills: null });
      expect(unknown.every((r) => r.effective === null)).toBe(true);
      expect(unknown.every((r) => r.accessLevel === null && r.agentAccess === null)).toBe(true);
    });
  });

  describe('access', () => {
    it("is the highest level the best standing in the chain opens: a corporation's faction counts", () => {
      // Ishukone 1.0 -> 2.8, Caldari 2.5 -> 4.0: the faction's 4.0 opens level 3
      expect(row(ISHUKONE).accessLevel).toBe(3);
    });

    it('counts the agent itself in an agent row', () => {
      // Hanna 8.0 -> 8.4 beats Ishukone (2.8) and Caldari (4.0): level 5
      expect(row(AGENT_L3).accessLevel).toBe(5);
    });

    it('is level 1 when a link in the chain is at -2.0 or lower', () => {
      // The level 1 agent is at -3.0 although the Navy is at 6.0
      expect(row(AGENT_L1).accessLevel).toBe(1);
      expect(row(GURISTAS_CORP).accessLevel).toBe(1);
    });

    it('is unknown for an agent the agents data leaves out', () => {
      expect(row(STORYLINE_AGENT).accessLevel).toBeNull();
    });

    it('treats a missing parent standing as 0', () => {
      const lone = buildNpcStandingRows(
        [{ from_id: AGENT_L3, from_type: 'agent', standing: 5 }],
        names,
        owners,
        reference
      );
      // 5.0 -> 6.0 alone: level 4
      expect(lone[0].accessLevel).toBe(4);
    });

    it('is unknown for a corporation or agent when the corporation data could not be read', () => {
      const unread = buildNpcStandingRows(entries, names, owners, {
        ...reference,
        corporations: null,
      });
      expect(row(NAVY, unread).accessLevel).toBeNull();
      expect(row(NAVY, unread).effective).toBeNull();
      expect(row(AGENT_L3, unread).accessLevel).toBeNull();
      // A faction needs no corporation data: 2.5 -> 4.0 opens level 3.
      expect(row(CALDARI, unread).accessLevel).toBe(3);
    });
  });

  describe('agent rows', () => {
    it('are open when the chain meets the level', () => {
      expect(row(AGENT_L3).agentAccess).toMatchObject({ open: true, needs: 3 });
    });

    it('need the standing of their level when short', () => {
      const short = buildNpcStandingRows(
        [{ from_id: AGENT_L3, from_type: 'agent', standing: 1 }],
        names,
        owners,
        { ...reference, skills: UNTRAINED }
      );
      expect(short[0].agentAccess).toMatchObject({ open: false, needs: 3, blockedBy: null });
    });

    it('are open at level 1 whatever the standing', () => {
      expect(row(AGENT_L1).agentAccess).toMatchObject({ open: true, needs: null });
    });

    it('are blocked, not merely short, when a link is at -2.0 or lower', () => {
      const blocked = buildNpcStandingRows(
        [
          { from_id: ISHUKONE, from_type: 'npc_corp', standing: -5 },
          { from_id: AGENT_L3, from_type: 'agent', standing: 9 },
        ],
        names,
        owners,
        { ...reference, skills: UNTRAINED }
      );
      expect(row(AGENT_L3, blocked).agentAccess).toMatchObject({
        open: false,
        blockedBy: { id: ISHUKONE },
      });
    });

    it('have no access answer when the agents data leaves them out', () => {
      expect(row(STORYLINE_AGENT).agentAccess).toBeNull();
    });

    it('are not given to faction or corporation rows', () => {
      expect(row(NAVY).agentAccess).toBeNull();
    });
  });

  it('keeps to base standings when no reference could be read', () => {
    const bare = buildNpcStandingRows(entries, names, owners, NO_NPC_STANDINGS_REFERENCE);
    expect(bare.every((r) => r.belongsTo === null && r.effective === null)).toBe(true);
    expect(bare.every((r) => r.accessLevel === null)).toBe(true);
    // No skills to lift it: even a faction's access stays unknown.
    expect(row(CALDARI, bare).accessLevel).toBeNull();
  });
});

describe('filterNpcStandingRows', () => {
  const filtered = (patch: Partial<NpcStandingsFilter>) =>
    filterNpcStandingRows(rows, { ...EVERY_NPC_STANDING, ...patch }).map((r) => r.id);

  it('returns every row for the empty filter', () => {
    expect(filtered({})).toHaveLength(rows.length);
  });

  it('matches name case-insensitively and id', () => {
    expect(filtered({ text: 'KUROSAWA' })).toEqual([AGENT_L3]);
    expect(filtered({ text: String(GURISTAS_CORP) })).toEqual([GURISTAS_CORP]);
    expect(filtered({ text: '  ' })).toHaveLength(rows.length);
  });

  it('matches what the row belongs to', () => {
    // Hanna works for Ishukone
    expect(filtered({ text: 'ishukone' })).toEqual([AGENT_L3, ISHUKONE]);
    // the Navy and Ishukone belong to Caldari State
    expect(filtered({ text: 'Caldari State' })).toEqual([NAVY, CALDARI, ISHUKONE]);
  });

  it("matches an agent's division", () => {
    expect(filtered({ text: 'security' })).toEqual([AGENT_L3]);
  });

  it('narrows to the chosen kinds', () => {
    expect(filtered({ kinds: new Set(['agent']) })).toEqual([AGENT_L3, STORYLINE_AGENT, AGENT_L1]);
  });

  it('keeps rows opening at least the chosen agent level, and drops unknown ones', () => {
    expect(filtered({ minAccess: 4 })).toEqual([AGENT_L3, NAVY]);
    expect(filtered({ minAccess: 2 })).not.toContain(STORYLINE_AGENT);
  });

  it('keeps only the fee owners', () => {
    expect(filtered({ feesOnly: true })).toEqual([NAVY, CALDARI]);
  });

  it('combines every criterion', () => {
    expect(filtered({ kinds: new Set(['corp']), minAccess: 4, feesOnly: true })).toEqual([NAVY]);
  });
});

describe('activeNpcStandingsFilterCount', () => {
  it('counts each filter set away from its default, not the search text', () => {
    expect(activeNpcStandingsFilterCount(EVERY_NPC_STANDING)).toBe(0);
    expect(activeNpcStandingsFilterCount({ ...EVERY_NPC_STANDING, text: 'navy' })).toBe(0);
    expect(
      activeNpcStandingsFilterCount({
        text: '',
        kinds: new Set(['agent']),
        minAccess: 3,
        feesOnly: true,
      })
    ).toBe(3);
  });
});

describe('countNpcStandingRows', () => {
  it('counts rows per kind', () => {
    expect(countNpcStandingRows(rows)).toEqual({ faction: 2, corp: 3, agent: 3 });
  });
});

describe('feeOwnerIds', () => {
  it('holds the six hub owner corps and five distinct factions, Manifest’s AIR Laboratories included', () => {
    const ids = feeOwnerIds();
    expect(ids.has(1000035)).toBe(true);
    expect(ids.has(500002)).toBe(true);
    expect(ids.has(1000413)).toBe(true);
    expect(ids.has(500028)).toBe(true);
    expect(ids.size).toBe(11);
  });
});

describe('npc access helpers', () => {
  const agent = (over: Partial<NpcStandingRow>): NpcStandingRow =>
    ({
      id: 1,
      name: 'Agent',
      kind: 'agent',
      base: 0,
      effective: 0,
      belongsTo: { name: 'Corp' },
      accessLevel: null,
      agentAccess: { open: true, needs: null, short: 0, blockedBy: null },
      nearest: null,
      usedForFees: false,
      ...over,
    }) as NpcStandingRow;

  it('sorts an open agent with no known level as 1 but exports it blank', () => {
    const row = agent({});
    expect(npcAccessSortValue(row)).toBe(1);
    expect(npcAccessLevel(row)).toBeNull();
  });

  it('reads 0 for an agent you cannot use, and nothing when it cannot be told', () => {
    const closed = agent({ agentAccess: { open: false, needs: 3, short: 1, blockedBy: null } });
    expect(npcAccessSortValue(closed)).toBe(0);
    expect(npcAccessLevel(closed)).toBe(0);
    expect(npcAccessSortValue(agent({ agentAccess: null }))).toBeUndefined();
  });

  it('words open, blocked and needs, and gives no text for an unknown need', () => {
    const t = (k: string) => k;
    expect(npcAgentAccessText(t, agent({}))).toBe('contacts.standings.accessOpen');
    expect(
      npcAgentAccessText(
        t,
        agent({ agentAccess: { open: false, needs: 3, short: 1, blockedBy: {} as never } })
      )
    ).toBe('contacts.standings.accessBlocked');
    expect(
      npcAgentAccessText(
        t,
        agent({ agentAccess: { open: false, needs: null, short: 1, blockedBy: null } })
      )
    ).toBeNull();
  });
});
