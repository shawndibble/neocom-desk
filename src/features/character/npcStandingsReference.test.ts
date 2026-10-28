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
vi.mock('@/features/standings/standingSkills', () => ({ loadStandingSkills: skillsMock }));
vi.mock('@/sde/loadSde', () => ({ loadNpcCorporationsFile: corporationsMock }));
vi.mock('@/sde/agents', () => ({ loadAgents: agentsMock }));
vi.mock('@/features/standings/corporationFactions', () => ({
  loadCorporationFactions: factionsMock,
}));

import { loadNpcStandingsReference, npcCorporationLookup } from './npcStandingsReference';

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
  });

  it('gathers skills, corporations and agents', async () => {
    const reference = await loadNpcStandingsReference(91);
    expect(skillsMock).toHaveBeenCalledWith(91);
    expect(reference.skills).toEqual(social);
    expect(reference.corporations?.factions.get(1000035)).toBe(500001);
    expect(reference.agents).toBe(agents);
  });

  it('leaves out what could not be read, rather than failing', async () => {
    skillsMock.mockRejectedValue(new Error('offline'));
    corporationsMock.mockRejectedValue(new Error('offline'));
    agentsMock.mockRejectedValue(new Error('offline'));
    expect(await loadNpcStandingsReference(91)).toEqual({
      skills: null,
      corporations: null,
      agents: null,
    });
  });

  it('reads unknown skills as null, not as untrained', async () => {
    skillsMock.mockResolvedValue(null);
    expect((await loadNpcStandingsReference(91)).skills).toBeNull();
  });
});
