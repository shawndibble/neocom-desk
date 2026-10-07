import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import {
  MINING_TAX_COMPRESSED_ORE_KEY,
  loadOreFormNames,
  useMiningTaxCompressedOre,
} from './oreForm';

const ZEOLITES = 45490;
const COMPRESSED_ZEOLITES = 62463;
const VELDSPAR = 1230;

const sdeMock = vi.hoisted(() => ({ loadCompressedOreTypeIds: vi.fn() }));
vi.mock('@/sde/loadSde', () => sdeMock);

const namesMock = vi.hoisted(() => ({ loadTypeNames: vi.fn() }));
vi.mock('@/features/character/typeNames', () => namesMock);

beforeEach(async () => {
  vi.clearAllMocks();
  sdeMock.loadCompressedOreTypeIds.mockResolvedValue({ [ZEOLITES]: COMPRESSED_ZEOLITES });
  namesMock.loadTypeNames.mockImplementation(async (ids: number[]) => {
    const all: Record<number, string> = {
      [ZEOLITES]: 'Zeolites',
      [COMPRESSED_ZEOLITES]: 'Compressed Zeolites',
      [VELDSPAR]: 'Veldspar',
    };
    return new Map(ids.map((id) => [id, all[id]]));
  });
  await db.settings.clear();
  useMiningTaxCompressedOre.setState({ value: true, hydrated: false });
});

describe('useMiningTaxCompressedOre', () => {
  it('defaults on', async () => {
    await useMiningTaxCompressedOre.getState().hydrate();
    expect(useMiningTaxCompressedOre.getState().value).toBe(true);
  });

  it('persists off under the sync.-prefixed key', async () => {
    await useMiningTaxCompressedOre.getState().setValue(false);
    expect((await db.settings.get(MINING_TAX_COMPRESSED_ORE_KEY))?.value).toBe(false);
  });
});

describe('loadOreFormNames', () => {
  it('names the Compressed type under the raw id, and keeps raw for ore without one', async () => {
    const names = await loadOreFormNames([ZEOLITES, VELDSPAR], true);
    expect(names.get(ZEOLITES)).toBe('Compressed Zeolites');
    expect(names.get(VELDSPAR)).toBe('Veldspar');
  });

  it('names the raw type when off', async () => {
    const names = await loadOreFormNames([ZEOLITES], false);
    expect(names.get(ZEOLITES)).toBe('Zeolites');
  });
});
