import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fitting } from '@/engine/fittings/types';

const loadMutaplasmids = vi.fn();
vi.mock('@/sde/loadSde', () => ({ loadMutaplasmids: () => loadMutaplasmids() }));

const { loadMutaplasmidLookup, resetMutaplasmidLookupForTests, withCheckedMutations } =
  await import('./mutaplasmidData');

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

describe('withCheckedMutations', () => {
  // Heavy Abyssal Energy Neutralizer (47832) from a Heavy Gremlin (16475), Gravid (47831).
  const fitting = (mutation: Fitting['modules'][number]['mutation']): Fitting => ({
    name: 'Neut',
    shipTypeId: 17843,
    modules: [{ slot: 'high', slotIndex: 0, typeId: 47832, state: 'active', mutation }],
    drones: [],
    cargo: [],
  });

  it('cuts a decoded mutation to the rolls its mutaplasmid makes', async () => {
    loadMutaplasmids.mockImplementation(bundled);
    const checked = await withCheckedMutations(
      fitting({ baseTypeId: 16475, mutaplasmidTypeId: 47831, attributes: { 6: 400, 73: 1 } })
    );
    expect(checked.modules[0]?.mutation?.attributes).toEqual({ 6: 400 });
  });

  it('drops every mutation when the data will not load', async () => {
    loadMutaplasmids.mockRejectedValue(new Error('offline'));
    const checked = await withCheckedMutations(
      fitting({ baseTypeId: 16475, mutaplasmidTypeId: 47831, attributes: { 6: 400 } })
    );
    expect(checked.modules[0]).not.toHaveProperty('mutation');
  });

  it('leaves a Fitting with no mutation alone, without loading the data', async () => {
    const plain = fitting(undefined);
    expect(await withCheckedMutations(plain)).toBe(plain);
    expect(loadMutaplasmids).not.toHaveBeenCalled();
  });
});
