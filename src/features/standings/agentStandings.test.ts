import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterStandingEntry } from '@/engine/market/standings';
import { NO_SOCIAL_SKILLS } from '@/engine/standings';
import { buildAgentIndex } from '@/sde/agents';
import { agentsOfCorporation, chainForAgent } from './agentStandings';

const mocks = vi.hoisted(() => ({ agents: vi.fn(), factions: vi.fn() }));
vi.mock('@/sde/agents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sde/agents')>()),
  loadAgents: mocks.agents,
}));
vi.mock('./corporationFactions', () => ({ loadCorporationFactions: mocks.factions }));

const CALDARI_NAVY = 1000035;
const GURISTAS_CORP = 1000127;
// [id, name, level, divisionId, corporationId, stationId, isLocator]
const INDEX = buildAgentIndex({
  divisions: { 22: 'Security', 23: 'Distribution' },
  agents: [
    [3009001, 'Alpha', 3, 22, CALDARI_NAVY, 60003760, 0],
    [3009002, 'Bravo', 2, 23, CALDARI_NAVY, 60003761, 1],
    [3009003, 'Charlie', 4, 22, CALDARI_NAVY, 60003762, 0],
    [3009004, 'Delta', 1, 22, CALDARI_NAVY, 60003763, 0], // no standing row
    [3009005, 'Echo', 2, 22, GURISTAS_CORP, 60000001, 0],
  ],
} as never);

const STANDINGS: CharacterStandingEntry[] = [
  { from_id: 500001, from_type: 'faction', standing: 1 },
  { from_id: CALDARI_NAVY, from_type: 'npc_corp', standing: 2 },
  { from_id: 3009001, from_type: 'agent', standing: 4 },
  { from_id: 3009002, from_type: 'agent', standing: 6 },
  { from_id: 3009003, from_type: 'agent', standing: -3 },
  { from_id: 3009005, from_type: 'agent', standing: 5 },
];
const SKILLS = { connections: 5, criminalConnections: 0, diplomacy: 0 };

beforeEach(() => {
  mocks.agents.mockReset().mockResolvedValue(INDEX);
  mocks.factions.mockReset().mockResolvedValue(
    new Map([
      [CALDARI_NAVY, 500001],
      [GURISTAS_CORP, 500010],
    ])
  );
});

describe('chainForAgent', () => {
  it("returns the agent and its chain, with the corporation taken from the agent's record", async () => {
    const result = await chainForAgent(STANDINGS, 3009001, NO_SOCIAL_SKILLS);
    expect(result?.agent).toMatchObject({ id: 3009001, level: 3, corporationId: CALDARI_NAVY });
    expect(result?.chain.links.map((l) => [l.kind, l.id, l.base])).toEqual([
      ['faction', 500001, 1],
      ['corporation', CALDARI_NAVY, 2],
      ['agent', 3009001, 4],
    ]);
  });

  it('lifts the standings by the skills', async () => {
    const result = await chainForAgent(STANDINGS, 3009001, SKILLS);
    expect(result?.chain.links[2].effective).toBeCloseTo(4 + 6 * 0.2, 10);
  });

  it('is null for an agent that is not in the basic-agent file (storyline, FW, research)', async () => {
    expect(await chainForAgent(STANDINGS, 3999999, SKILLS)).toBeNull();
  });
});

describe('agentsOfCorporation', () => {
  it('lists the agents the pilot holds a standing with, best effective standing first', async () => {
    const known = await agentsOfCorporation(CALDARI_NAVY, STANDINGS, NO_SOCIAL_SKILLS);
    expect(known.map((k) => [k.agent.id, k.effective])).toEqual([
      [3009002, 6],
      [3009001, 4],
      [3009003, -3],
    ]);
  });

  it('carries level, division name, station and both standings', async () => {
    const [first] = await agentsOfCorporation(CALDARI_NAVY, STANDINGS, SKILLS);
    expect(first).toMatchObject({
      agent: { id: 3009002, level: 2, stationId: 60003761 },
      divisionName: 'Distribution',
      base: 6,
    });
    expect(first.effective).toBeCloseTo(6 + 4 * 0.2, 10);
  });

  it('leaves out an agent the pilot has no standing row for', async () => {
    const known = await agentsOfCorporation(CALDARI_NAVY, STANDINGS, SKILLS);
    expect(known.map((k) => k.agent.id)).not.toContain(3009004);
  });

  it('lifts a pirate corporation agent by Criminal Connections, not Connections', async () => {
    const [echo] = await agentsOfCorporation(GURISTAS_CORP, STANDINGS, SKILLS);
    expect(echo.effective).toBe(5);
  });

  it('breaks an effective-standing tie by agent id', async () => {
    const tied: CharacterStandingEntry[] = [
      { from_id: 3009002, from_type: 'agent', standing: 3 },
      { from_id: 3009001, from_type: 'agent', standing: 3 },
    ];
    const known = await agentsOfCorporation(CALDARI_NAVY, tied, NO_SOCIAL_SKILLS);
    expect(known.map((k) => k.agent.id)).toEqual([3009001, 3009002]);
  });

  it('is empty for a corporation with no agents', async () => {
    expect(await agentsOfCorporation(1000130, STANDINGS, SKILLS)).toEqual([]);
  });
});
