import { describe, expect, it } from 'vitest';
import type { CharacterStandingEntry } from '@/engine/market/standings';
import { NO_SOCIAL_SKILLS, standingChain, type ChainEntity } from '@/engine/standings';
import type { UniverseFaction } from '@/esi/endpoints';
import type { LpCorporationEntry, NpcStationEntry } from '@/sde/marketTypes';
import type { NpcCorporationEntry } from '@/sde/types';
import type { KnownAgent } from '../agentStandings';
import type { StandingSkills } from '../standingSkills';
import {
  accessModel,
  agentWhereRows,
  corporationWhereRows,
  factionWhereRows,
  knownAgentRows,
  knownCorporationRows,
  loyaltyModel,
  standingModel,
  stationsModel,
} from './npcInfoModel';

const CALDARI = 500001;
const GURISTAS = 500010;
const CALDARI_NAVY = 1000035;
const ISHUKONE = 1000125;
const JITA_44 = 60003760;
const SKILLS: StandingSkills = {
  social: { connections: 4, criminalConnections: 0, diplomacy: 0 },
  brokerRelationsLevel: 4,
};

const chainOf = (entities: ChainEntity[], factionId: number | null = CALDARI, connections = 0) =>
  standingChain(entities, factionId, { ...NO_SOCIAL_SKILLS, connections });
const nameOf = ({ id }: { id: number }) => `#${id}`;

const faction = (base: number): ChainEntity => ({ kind: 'faction', id: CALDARI, base });
const corporation = (base: number, id = CALDARI_NAVY): ChainEntity => ({
  kind: 'corporation',
  id,
  base,
});
const agent = (base: number): ChainEntity => ({ kind: 'agent', id: 3009001, base });

describe('standingModel', () => {
  it('bolds the highest of a faction and corporation and says agents use it', () => {
    const model = standingModel(chainOf([faction(3), corporation(5)]), nameOf, true);
    expect(model.rows.map((row) => [row.link.kind, row.highest])).toEqual([
      ['faction', false],
      ['corporation', true],
    ]);
    expect(model.note).toEqual({ kind: 'highest', name: `#${CALDARI_NAVY}` });
    expect(model.skillsKnown).toBe(true);
  });

  it('gives a faction alone no bold and no sentence', () => {
    const model = standingModel(chainOf([faction(3)]), nameOf, true);
    expect(model.rows[0]!.highest).toBe(false);
    expect(model.note).toBeNull();
  });

  it('says a link at -2.0 or lower blocks level 2+ agents, instead of naming the highest', () => {
    const model = standingModel(chainOf([faction(6), corporation(-2.5), agent(1)]), nameOf, true);
    expect(model.note).toEqual({ kind: 'blocked', name: `#${CALDARI_NAVY}`, effective: -2.5 });
  });

  it('reads the effective standing from the chain: base lifted by the skills', () => {
    const model = standingModel(chainOf([corporation(5)], CALDARI, 4), nameOf, true);
    expect(model.rows[0]!.link.base).toBe(5);
    expect(model.rows[0]!.link.effective).toBeCloseTo(5.8, 10);
  });

  it('with skills unknown the effective standing is the base and skills are not mentioned', () => {
    const model = standingModel(chainOf([corporation(5)]), nameOf, false);
    expect(model.rows[0]!.link.effective).toBe(5);
    expect(model.skillsKnown).toBe(false);
  });
});

describe('accessModel', () => {
  it('opens the levels the best standing reaches and says what the next one takes', () => {
    const model = accessModel(chainOf([faction(5.48), corporation(6.06)]), null, nameOf);
    expect(model.segments.map((s) => [s.level, s.needs, s.open])).toEqual([
      [1, null, true],
      [2, 1, true],
      [3, 3, true],
      [4, 5, true],
      [5, 7, false],
    ]);
    expect(model.verdict.kind).toBe('next');
    if (model.verdict.kind !== 'next') return;
    expect(model.verdict.level).toBe(5);
    expect(model.verdict.needs).toBe(7);
    expect(model.verdict.short).toBeCloseTo(0.94, 10);
  });

  it('says every level is open at 7.0', () => {
    expect(accessModel(chainOf([corporation(7)]), null, nameOf).verdict).toEqual({ kind: 'all' });
  });

  it('closes level 2 and up while a link is at -2.0 or lower, even with a high one', () => {
    const model = accessModel(chainOf([faction(9), corporation(-2)]), null, nameOf);
    expect(model.segments.map((s) => s.open)).toEqual([true, false, false, false, false]);
    expect(model.verdict).toEqual({ kind: 'blocked' });
  });

  it('outlines an agent’s own level and says whether you can use it', () => {
    const model = accessModel(chainOf([faction(5), corporation(2), agent(7.65)]), 3, nameOf);
    expect(model.segments.filter((s) => s.own).map((s) => s.level)).toEqual([3]);
    expect(model.verdict).toEqual({
      kind: 'agent',
      level: 3,
      open: true,
      needs: 3,
      have: 7.65,
      short: 0,
      blockedBy: null,
    });
  });

  it('says how much short for an agent you cannot use yet', () => {
    const model = accessModel(chainOf([corporation(1)]), 4, nameOf);
    expect(model.verdict).toMatchObject({
      kind: 'agent',
      open: false,
      needs: 5,
      have: 1,
      short: 4,
    });
  });

  it('names the link that blocks a level 3 agent', () => {
    const model = accessModel(chainOf([faction(-2.5), corporation(8)]), 3, nameOf);
    expect(model.verdict).toMatchObject({
      kind: 'agent',
      open: false,
      blockedBy: { name: `#${CALDARI}`, effective: -2.5 },
    });
  });

  it('never asks anything of a level 1 agent', () => {
    const model = accessModel(chainOf([faction(-5)]), 1, nameOf);
    expect(model.verdict).toMatchObject({ kind: 'agent', open: true, needs: null });
  });
});

const station = (
  id: number,
  ownerCorporationId: number | undefined,
  ownerFactionId: number | undefined,
  systemId = id,
  reprocessingStationsTake?: number
): NpcStationEntry => ({
  id,
  name: `Station ${id}`,
  systemId,
  ownerCorporationId,
  ownerFactionId,
  reprocessingStationsTake,
});
const STANDINGS: CharacterStandingEntry[] = [
  { from_id: CALDARI, from_type: 'faction', standing: 5 },
  { from_id: CALDARI_NAVY, from_type: 'npc_corp', standing: 6 },
];
const CALDARI_STATIONS = [
  station(JITA_44, CALDARI_NAVY, CALDARI, 30000142),
  station(2, CALDARI_NAVY, CALDARI, 30000143),
  station(3, ISHUKONE, CALDARI, 30000144),
];

describe('stationsModel', () => {
  const navyChain = chainOf([faction(5), corporation(6)], CALDARI, 4);

  it('quotes a corporation that owns a Trade Hub at the hub: broker fee on base, reprocessing on effective', () => {
    const { rows, brokerRelationsLevel } = stationsModel({
      kind: 'corporation',
      id: CALDARI_NAVY,
      stations: CALDARI_STATIONS,
      chain: navyChain,
      standings: STANDINGS,
      skills: SKILLS,
    });
    expect(brokerRelationsLevel).toBe(4);
    const [broker, reprocessing] = rows;
    expect(broker).toMatchObject({ kind: 'broker', place: 'Jita 4-4' });
    // 3% - 0.3% * 4 = 1.8% at zero; 0.03 * 5 + 0.02 * 6 = 0.27 off.
    expect(broker!.atZeroPct).toBeCloseTo(1.8, 10);
    expect(broker!.atYoursPct).toBeCloseTo(1.53, 10);
    expect(broker!.savingPct).toBeCloseTo(0.27, 10);
    // Effective corporation standing 6 + 4 * 0.04 * 4 = 6.64: 5% * (1 - 0.15 * 6.64).
    expect(reprocessing).toMatchObject({ kind: 'reprocessing', place: null, atZeroPct: 5 });
    expect(reprocessing!.atYoursPct).toBeCloseTo(5 * (1 - 0.15 * 6.64), 10);
  });

  it('has no broker row for a corporation that owns no Trade Hub, only reprocessing', () => {
    const { rows, brokerRelationsLevel } = stationsModel({
      kind: 'corporation',
      id: ISHUKONE,
      stations: CALDARI_STATIONS,
      chain: chainOf([faction(5), corporation(2, ISHUKONE)], CALDARI, 4),
      standings: STANDINGS,
      skills: SKILLS,
    });
    expect(rows.map((row) => row.kind)).toEqual(['reprocessing']);
    expect(brokerRelationsLevel).toBeNull();
  });

  it('reads each station’s own take: the hub’s for a hub owner, the most common otherwise', () => {
    const hubTake = stationsModel({
      kind: 'corporation',
      id: CALDARI_NAVY,
      stations: [
        station(JITA_44, CALDARI_NAVY, CALDARI, 1, 0.025),
        station(2, CALDARI_NAVY, CALDARI),
      ],
      chain: navyChain,
      standings: STANDINGS,
      skills: null,
    });
    expect(hubTake.rows[0]!.atZeroPct).toBe(2.5);
    const commonTake = stationsModel({
      kind: 'corporation',
      id: ISHUKONE,
      stations: [
        station(1, ISHUKONE, CALDARI, 1, 0.025),
        station(2, ISHUKONE, CALDARI, 2),
        station(3, ISHUKONE, CALDARI, 3),
      ],
      chain: chainOf([corporation(0, ISHUKONE)]),
      standings: [],
      skills: null,
    });
    expect(commonTake.rows[0]!.atZeroPct).toBe(5);
  });

  it('with skills unknown shows no broker row and prices reprocessing at the base standing', () => {
    const { rows } = stationsModel({
      kind: 'corporation',
      id: CALDARI_NAVY,
      stations: CALDARI_STATIONS,
      chain: chainOf([faction(5), corporation(6)]),
      standings: STANDINGS,
      skills: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.atYoursPct).toBeCloseTo(5 * (1 - 0.15 * 6), 10);
  });

  it('floors reprocessing at zero past 6.67 and saves nothing at zero standing', () => {
    const high = stationsModel({
      kind: 'corporation',
      id: ISHUKONE,
      stations: CALDARI_STATIONS,
      chain: chainOf([corporation(8, ISHUKONE)]),
      standings: [],
      skills: null,
    });
    expect(high.rows[0]).toMatchObject({ atYoursPct: 0, savingPct: 5 });
    const none = stationsModel({
      kind: 'corporation',
      id: ISHUKONE,
      stations: CALDARI_STATIONS,
      chain: chainOf([corporation(0, ISHUKONE)]),
      standings: [],
      skills: null,
    });
    expect(none.rows[0]!.savingPct).toBe(0);
  });

  it('quotes a faction one pair per Trade Hub it owns, with the hub owner’s corporation standing', () => {
    const { rows } = stationsModel({
      kind: 'faction',
      id: CALDARI,
      stations: CALDARI_STATIONS,
      chain: chainOf([faction(5)], CALDARI, 4),
      standings: STANDINGS,
      skills: SKILLS,
    });
    expect(rows.map((row) => [row.kind, row.place])).toEqual([
      ['broker', 'Jita 4-4'],
      ['reprocessing', 'Jita 4-4'],
    ]);
    // Same fee as the Caldari Navy's own modal: 5 faction, 6 corporation.
    expect(rows[0]!.savingPct).toBeCloseTo(0.27, 10);
    expect(rows[1]!.atYoursPct).toBeCloseTo(5 * (1 - 0.15 * 6.64), 10);
  });

  it('says nothing for a faction or corporation that owns no station in the snapshot', () => {
    expect(
      stationsModel({
        kind: 'faction',
        id: GURISTAS,
        stations: CALDARI_STATIONS,
        chain: chainOf([{ kind: 'faction', id: GURISTAS, base: 0 }], GURISTAS),
        standings: [],
        skills: SKILLS,
      })
    ).toEqual({ rows: [], brokerRelationsLevel: null });
    expect(
      stationsModel({
        kind: 'corporation',
        id: 1000999,
        stations: CALDARI_STATIONS,
        chain: chainOf([corporation(0, 1000999)]),
        standings: [],
        skills: SKILLS,
      }).rows
    ).toEqual([]);
  });
});

describe('corporationWhereRows', () => {
  const navy: NpcCorporationEntry = {
    id: CALDARI_NAVY,
    name: 'Caldari Navy',
    ticker: 'CN',
    factionId: CALDARI,
    hqStationId: JITA_44,
  };

  it('lists the headquarters, the station count and the nearest station', () => {
    const rows = corporationWhereRows({
      corporation: navy,
      stations: CALDARI_STATIONS,
      nearest: { stationId: 2, stationName: 'Station 2', systemId: 30000143, jumps: 1 },
    });
    expect(rows).toEqual([
      { kind: 'headquarters', stationId: JITA_44, name: `Station ${JITA_44}` },
      { kind: 'stations', stations: 2, systems: 2 },
      { kind: 'nearest', stationId: 2, name: 'Station 2', systemId: 30000143, jumps: 1 },
    ]);
  });

  it('omits a headquarters the station snapshot does not hold', () => {
    const rows = corporationWhereRows({
      corporation: { ...navy, id: 1000001, hqStationId: 60000001 },
      stations: CALDARI_STATIONS,
      nearest: null,
    });
    expect(rows).toEqual([]);
  });

  it('is empty for a corporation the NPC file does not know', () => {
    expect(
      corporationWhereRows({ corporation: undefined, stations: CALDARI_STATIONS, nearest: null })
    ).toEqual([]);
  });
});

describe('factionWhereRows', () => {
  const caldari: UniverseFaction = {
    faction_id: CALDARI,
    name: 'Caldari State',
    description: 'A state.',
    militia_corporation_id: 1000180,
    size_factor: 5,
    solar_system_id: 30000145,
    station_count: 412,
    station_system_count: 118,
    is_unique: true,
  };

  it('lists the capital with its jumps, the station counts and the militia', () => {
    expect(
      factionWhereRows({
        faction: caldari,
        capitalName: 'Caldari Prime',
        capitalJumps: 4,
        militiaName: 'State Protectorate',
      })
    ).toEqual([
      { kind: 'capital', systemId: 30000145, name: 'Caldari Prime', jumps: 4 },
      { kind: 'stations', stations: 412, systems: 118 },
      { kind: 'militia', corporationId: 1000180, name: 'State Protectorate' },
    ]);
  });

  it('skips what ESI omits', () => {
    const bare: UniverseFaction = {
      faction_id: GURISTAS,
      name: 'Guristas Pirates',
      description: '',
      size_factor: 0,
      station_count: 0,
      station_system_count: 0,
      is_unique: true,
    };
    expect(
      factionWhereRows({ faction: bare, capitalName: null, capitalJumps: null, militiaName: null })
    ).toEqual([]);
    expect(
      factionWhereRows({
        faction: undefined,
        capitalName: null,
        capitalJumps: null,
        militiaName: null,
      })
    ).toEqual([]);
  });
});

describe('agentWhereRows', () => {
  it('gives the station with its jumps, then the level and division', () => {
    expect(
      agentWhereRows({
        level: 3,
        divisionName: 'Security',
        station: station(60000010, ISHUKONE, CALDARI, 30000200),
        jumps: 6,
      })
    ).toEqual([
      {
        kind: 'station',
        stationId: 60000010,
        name: 'Station 60000010',
        systemId: 30000200,
        jumps: 6,
      },
      { kind: 'agent', level: 3, divisionName: 'Security' },
    ]);
  });

  it('omits the station for one the snapshot lacks', () => {
    expect(
      agentWhereRows({ level: 1, divisionName: undefined, station: undefined, jumps: null })
    ).toEqual([{ kind: 'agent', level: 1, divisionName: undefined }]);
  });
});

describe('knownAgentRows', () => {
  const known = (id: number, stationId: number, effective: number): KnownAgent => ({
    agent: {
      id,
      name: `Agent ${id}`,
      level: 3,
      divisionId: 1,
      corporationId: ISHUKONE,
      stationId,
      isLocator: false,
    },
    divisionName: 'Security',
    base: effective,
    effective,
  });

  it('keeps the order given and attaches each agent’s system and jumps', () => {
    const rows = knownAgentRows(
      [known(3009001, 2, 7.65), known(3009002, 3, 6.56)],
      CALDARI_STATIONS,
      new Map([[30000143, 6]])
    );
    expect(rows.map((row) => [row.agentId, row.place])).toEqual([
      [3009001, { systemId: 30000143, jumps: 6 }],
      [3009002, { systemId: 30000144, jumps: null }],
    ]);
    expect(rows[0]).toMatchObject({ name: 'Agent 3009001', level: 3, divisionName: 'Security' });
  });

  it('has no place for an agent whose station is not in the snapshot', () => {
    const [row] = knownAgentRows([known(3009001, 999, 1)], CALDARI_STATIONS, new Map());
    expect(row!.place).toBeNull();
  });
});

describe('knownCorporationRows', () => {
  const corporationFactions = new Map([
    [CALDARI_NAVY, CALDARI],
    [ISHUKONE, CALDARI],
    [1000002, CALDARI],
    [1000007, 500002],
  ]);
  const names = new Map([
    [CALDARI_NAVY, 'Caldari Navy'],
    [ISHUKONE, 'Ishukone'],
  ]);

  it('lists the faction’s corporations the pilot has a standing with, best effective first', () => {
    const rows = knownCorporationRows({
      factionId: CALDARI,
      corporationFactions,
      standings: [
        { from_id: ISHUKONE, from_type: 'npc_corp', standing: 7 },
        { from_id: CALDARI_NAVY, from_type: 'npc_corp', standing: 6 },
        { from_id: 1000007, from_type: 'npc_corp', standing: 9 },
      ],
      social: { ...NO_SOCIAL_SKILLS, connections: 5 },
      criminal: false,
      nameOf: (id) => names.get(id) ?? `#${id}`,
    });
    expect(rows.map((row) => [row.name, Math.round(row.effective * 100) / 100])).toEqual([
      ['Ishukone', 7.6],
      ['Caldari Navy', 6.8],
    ]);
  });

  it('is empty when the pilot has none of its corporations', () => {
    expect(
      knownCorporationRows({
        factionId: CALDARI,
        corporationFactions,
        standings: [],
        social: NO_SOCIAL_SKILLS,
        criminal: false,
        nameOf: String,
      })
    ).toEqual([]);
  });
});

describe('loyaltyModel', () => {
  const stores: LpCorporationEntry[] = [{ id: CALDARI_NAVY, name: 'Caldari Navy' }];

  it('gives the balance and says a store exists', () => {
    expect(loyaltyModel(CALDARI_NAVY, new Map([[CALDARI_NAVY, 12400]]), stores)).toEqual({
      balance: 12400,
      hasStore: true,
    });
  });

  it('says none yet for a store the pilot has no points in', () => {
    expect(loyaltyModel(CALDARI_NAVY, new Map(), stores)).toEqual({ balance: 0, hasStore: true });
  });

  it('keeps points held at a corporation with no store, and drops a corporation with neither', () => {
    expect(loyaltyModel(ISHUKONE, new Map([[ISHUKONE, 5]]), stores)).toEqual({
      balance: 5,
      hasStore: false,
    });
    expect(loyaltyModel(ISHUKONE, new Map(), stores)).toBeNull();
  });
});
