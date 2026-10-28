import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NpcCorporationsFile } from './types';

const FILE: NpcCorporationsFile = {
  factions: [
    { id: 500001, name: 'Caldari State' },
    { id: 500002, name: 'Minmatar Republic' },
  ],
  corporations: [
    { id: 1000035, name: 'Caldari Navy', ticker: 'CN', factionId: 500001, hqStationId: 60003760 },
    { id: 1000130, name: 'Sisters of EVE', ticker: 'SOE' },
  ],
};

const loadNpcCorporationsFile = vi.fn(async (): Promise<NpcCorporationsFile> => FILE);
vi.mock('./loadSde', () => ({ loadNpcCorporationsFile: () => loadNpcCorporationsFile() }));

import { buildNpcCorporationIndex, loadNpcCorporations } from './npcCorporations';

beforeEach(() => {
  loadNpcCorporations.reset();
  loadNpcCorporationsFile.mockReset();
  loadNpcCorporationsFile.mockResolvedValue(FILE);
});

describe('buildNpcCorporationIndex', () => {
  const index = buildNpcCorporationIndex(FILE);

  it('finds a corporation with its faction and headquarters', () => {
    expect(index.corporationById(1000035)).toEqual({
      id: 1000035,
      name: 'Caldari Navy',
      ticker: 'CN',
      factionId: 500001,
      hqStationId: 60003760,
    });
  });

  it('leaves a factionless corporation without a faction', () => {
    expect(index.corporationById(1000130)?.factionId).toBeUndefined();
  });

  it('answers undefined for an id that is not an NPC corporation', () => {
    expect(index.corporationById(98000001)).toBeUndefined();
  });

  it('names a faction', () => {
    expect(index.factionName(500002)).toBe('Minmatar Republic');
    expect(index.factionName(1)).toBeUndefined();
  });
});

describe('loadNpcCorporations', () => {
  it('reads the file once however many callers ask', async () => {
    await Promise.all([loadNpcCorporations(), loadNpcCorporations()]);

    expect(loadNpcCorporationsFile).toHaveBeenCalledTimes(1);
  });

  it('rejects when the file cannot be read, and retries on the next call', async () => {
    loadNpcCorporationsFile.mockRejectedValueOnce(new Error('offline'));
    await expect(loadNpcCorporations()).rejects.toThrow('offline');

    expect((await loadNpcCorporations()).corporationById(1000035)?.name).toBe('Caldari Navy');
  });
});

describe('the baked public/data/npcCorporations.json', () => {
  it('puts Caldari Navy in the Caldari State', () => {
    const baked = JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'data', 'npcCorporations.json'), 'utf-8')
    ) as NpcCorporationsFile;
    const index = buildNpcCorporationIndex(baked);

    const navy = index.corporationById(1000035);
    expect(navy?.name).toBe('Caldari Navy');
    expect(index.factionName(navy?.factionId ?? 0)).toBe('Caldari State');
  });
});
