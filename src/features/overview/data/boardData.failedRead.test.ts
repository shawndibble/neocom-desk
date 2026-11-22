import { describe, expect, it, vi } from 'vitest';

const failed = { cached: null, needsReauth: false };
const reads = vi.hoisted(() => ({ result: null as unknown }));

vi.mock('@/features/pi/data', () => ({
  loadCharacterPlanets: async () => reads.result,
  loadAllColonyDetails: async () => [],
}));
vi.mock('@/features/industry/jobs', () => ({
  loadAllCharactersIndustryJobs: async () => ({ entries: [], skipped: [] }),
  loadCharacterIndustryJobs: async () => reads.result,
}));
vi.mock('@/features/character/contracts', () => ({
  loadContracts: async () => reads.result,
}));

const { loadPlanetaryBoard, loadIndustryBoard, loadContractsBoard } = await import('./boardData');

describe('a read that landed nothing is a failure, never an empty board', () => {
  it('planetary rejects instead of "no colonies"', async () => {
    reads.result = failed;
    await expect(loadPlanetaryBoard(1, { cancelled: false })).rejects.toThrow();
  });

  it('industry rejects instead of "no jobs"', async () => {
    reads.result = failed;
    await expect(loadIndustryBoard(1)).rejects.toThrow();
  });

  it('contracts rejects instead of "no contracts"', async () => {
    reads.result = failed;
    await expect(loadContractsBoard(1)).rejects.toThrow();
  });
});
