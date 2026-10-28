import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentsFile } from './types';

const FILE: AgentsFile = {
  divisions: { '22': 'Distribution', '24': 'Security' },
  agents: [
    [3008416, 'Antaken Kamola', 1, 22, 1000002, 60000004, 0],
    [3008417, 'Bela Zuun', 3, 24, 1000002, 60000259, 1],
    [3009001, 'Cana Rhion', 4, 24, 1000035, 60003760, 0],
  ],
};

const loadAgentsFile = vi.fn(async (): Promise<AgentsFile> => FILE);
vi.mock('./loadSde', () => ({ loadAgentsFile: () => loadAgentsFile() }));

import { buildAgentIndex, loadAgents } from './agents';

beforeEach(() => {
  loadAgents.reset();
  loadAgentsFile.mockReset();
  loadAgentsFile.mockResolvedValue(FILE);
});

describe('buildAgentIndex', () => {
  const index = buildAgentIndex(FILE);

  it('finds an agent by id, with isLocator as a boolean', () => {
    expect(index.agentById(3008417)).toEqual({
      id: 3008417,
      name: 'Bela Zuun',
      level: 3,
      divisionId: 24,
      corporationId: 1000002,
      stationId: 60000259,
      isLocator: true,
    });
    expect(index.agentById(3008416)?.isLocator).toBe(false);
  });

  it('answers undefined for an agent the file does not hold', () => {
    expect(index.agentById(3999999)).toBeUndefined();
  });

  it("lists a corporation's agents in file order, and none for one without", () => {
    expect(index.agentsByCorporation(1000002).map((a) => a.name)).toEqual([
      'Antaken Kamola',
      'Bela Zuun',
    ]);
    expect(index.agentsByCorporation(1000035).map((a) => a.id)).toEqual([3009001]);
    expect(index.agentsByCorporation(1000130)).toEqual([]);
  });

  it('names a division, and answers undefined for one no agent works in', () => {
    expect(index.divisionName(24)).toBe('Security');
    expect(index.divisionName(18)).toBeUndefined();
  });
});

describe('loadAgents', () => {
  it('reads the file once however many callers ask', async () => {
    await Promise.all([loadAgents(), loadAgents(), loadAgents()]);

    expect(loadAgentsFile).toHaveBeenCalledTimes(1);
    expect((await loadAgents()).agentById(3009001)?.name).toBe('Cana Rhion');
  });

  it('rejects when the file cannot be read, and retries on the next call', async () => {
    loadAgentsFile.mockRejectedValueOnce(new Error('offline'));
    await expect(loadAgents()).rejects.toThrow('offline');

    expect((await loadAgents()).agentById(3009001)?.name).toBe('Cana Rhion');
  });
});

describe('the baked public/data/agents.json', () => {
  const baked = JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'agents.json'), 'utf-8')
  ) as AgentsFile;

  it('reads through the index: levels 1-5, and every division named', () => {
    const index = buildAgentIndex(baked);
    expect(baked.agents.length).toBeGreaterThan(7000);
    for (const [id, , level, divisionId] of baked.agents) {
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(5);
      expect(index.divisionName(divisionId), `agent ${id}`).toBeTruthy();
    }
  });
});
