import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadMutaplasmids = vi.fn();
vi.mock('@/sde/loadSde', () => ({ loadMutaplasmids: () => loadMutaplasmids() }));

const { loadMutaplasmidLookup, resetMutaplasmidLookupForTests } = await import('./mutaplasmidData');

async function bundled(): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL('../../../public/data/mutaplasmids.json', import.meta.url), 'utf8')
  );
}

beforeEach(() => {
  loadMutaplasmids.mockReset();
  resetMutaplasmidLookupForTests();
});

describe('loadMutaplasmidLookup', () => {
  it('reads the bundled data: the Heavy Abyssal Energy Neutralizer from a Heavy Gremlin', async () => {
    loadMutaplasmids.mockImplementation(bundled);
    const lookup = await loadMutaplasmidLookup();

    // Gravid Heavy Energy Neutralizer Mutaplasmid, build 3607705.
    expect(lookup.resultingType(16475, 47831)).toBe(47832);
    expect(lookup.isAbyssalType(47832)).toBe(true);
    expect(lookup.attributeId('energyNeutralizerAmount')).toBe(97);
    expect(lookup.mutaplasmidsForResult(47832)).toHaveLength(6);
  });

  it('loads once, and again after a failure', async () => {
    loadMutaplasmids.mockRejectedValueOnce(new Error('offline'));
    loadMutaplasmids.mockImplementation(bundled);

    await expect(loadMutaplasmidLookup()).rejects.toThrow('offline');
    const first = await loadMutaplasmidLookup();
    expect(await loadMutaplasmidLookup()).toBe(first);
    expect(loadMutaplasmids).toHaveBeenCalledTimes(2);
  });
});
