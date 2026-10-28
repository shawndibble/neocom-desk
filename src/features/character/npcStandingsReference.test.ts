import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NpcCorporationsFile } from '@/sde/types';

const FILE: NpcCorporationsFile = {
  factions: [{ id: 500001, name: 'Caldari State' }],
  corporations: [
    { id: 1000035, name: 'Caldari Navy', ticker: 'CN', factionId: 500001 },
    { id: 1000130, name: 'Sisters of EVE', ticker: 'SOE' },
  ],
};

const skillsMock = vi.hoisted(() => vi.fn());
const corporationsMock = vi.hoisted(() => vi.fn());
const agentsMock = vi.hoisted(() => vi.fn());
const factionsMock = vi.hoisted(() => vi.fn());
const stationsMock = vi.hoisted(() => vi.fn());
const jumpsMock = vi.hoisted(() => vi.fn());
vi.mock('@/features/standings/standingSkills', () => ({ loadStandingSkills: skillsMock }));
vi.mock('@/sde/loadSde', () => ({ loadNpcCorporationsFile: corporationsMock }));
vi.mock('@/sde/agents', () => ({ loadAgents: agentsMock }));
vi.mock('@/sde/loadMarketSde', () => ({ loadNpcStations: stationsMock }));
vi.mock('@/features/standings/stationJumps', () => ({ loadJumpsFromCurrent: jumpsMock }));
vi.mock('@/features/standings/corporationFactions', () => ({
  loadCorporationFactions: factionsMock,
}));

import { loadNpcStandingsReference, npcCorporationLookup } from './npcStandingsReference';

const STATIONS = [
  { id: 60000001, name: 'Navy HQ', systemId: 30000142, ownerCorporationId: 1000035 },
];
const JUMPS = new Map([[30000142, 3]]);

describe('npcCorporationLookup', () => {
  const lookup = npcCorporationLookup(FILE, new Map([[1000035, 500001]]));

  it('maps a corporation to its faction and leaves a factionless one out', () => {
    expect(lookup.factions.get(1000035)).toBe(500001);
    expect(lookup.factions.has(1000130)).toBe(false);
  });

  it('names corporations and factions', () => {
    expect(lookup.corporationName(1000130)).toBe('Sisters of EVE');
    expect(lookup.factionName(500001)).toBe('Caldari State');
    expect(lookup.corporationName(1)).toBeUndefined();
  });
});

describe('loadNpcStandingsReference', () => {
  const agents = { agentById: () => undefined, divisionName: () => undefined };
  const social = { connections: 4, criminalConnections: 0, diplomacy: 2 };

  beforeEach(() => {
    skillsMock.mockReset().mockResolvedValue({ social, brokerRelationsLevel: 3 });
    corporationsMock.mockReset().mockResolvedValue(FILE);
    agentsMock.mockReset().mockResolvedValue(agents);
    factionsMock.mockReset().mockResolvedValue(new Map([[1000035, 500001]]));
    stationsMock.mockReset().mockResolvedValue(STATIONS);
    jumpsMock.mockReset().mockResolvedValue(JUMPS);
  });

  it('gathers skills, corporations, agents, stations and the jumps to them', async () => {
    const reference = await loadNpcStandingsReference(91, true);
    expect(skillsMock).toHaveBeenCalledWith(91);
    expect(reference.skills).toEqual(social);
    expect(reference.corporations?.factions.get(1000035)).toBe(500001);
    expect(reference.agents).toBe(agents);
    expect(reference.stations).toBe(STATIONS);
    expect(reference.jumps).toBe(JUMPS);
    expect(jumpsMock).toHaveBeenCalledWith(91);
  });

  it('leaves out what could not be read, rather than failing', async () => {
    skillsMock.mockRejectedValue(new Error('offline'));
    corporationsMock.mockRejectedValue(new Error('offline'));
    agentsMock.mockRejectedValue(new Error('offline'));
    stationsMock.mockRejectedValue(new Error('offline'));
    jumpsMock.mockResolvedValue(null);
    expect(await loadNpcStandingsReference(91, true)).toEqual({
      skills: null,
      corporations: null,
      agents: null,
      stations: null,
      jumps: null,
    });
  });

  it('leaves the agents file unread when the pilot holds no agent standing', async () => {
    const reference = await loadNpcStandingsReference(91, false);
    expect(agentsMock).not.toHaveBeenCalled();
    expect(reference.agents).toBeNull();
  });

  it('reads unknown skills as null, not as untrained', async () => {
    skillsMock.mockResolvedValue(null);
    expect((await loadNpcStandingsReference(91, true)).skills).toBeNull();
  });
});
