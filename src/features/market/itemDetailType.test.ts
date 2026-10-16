import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTypeInfo } from '@/sde/loadTypeInfo';
import { loadUniverseTypeOnce } from '@/features/skills/data';
import { loadItemDetailType } from './itemDetailType';

vi.mock('@/sde/loadTypeInfo', () => ({ loadTypeInfo: vi.fn() }));
vi.mock('@/features/skills/data', () => ({ loadUniverseTypeOnce: vi.fn() }));

const mockedLoadTypeInfo = vi.mocked(loadTypeInfo);
const mockedLoadUniverseTypeOnce = vi.mocked(loadUniverseTypeOnce);

const RIFTER = 587;

const esiRifter = {
  type_id: RIFTER,
  name: 'Rifter',
  description: 'From ESI.',
  group_id: 25,
  published: true,
  volume: 27289,
  dogma_attributes: [{ attribute_id: 9, value: 350 }],
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('loadItemDetailType', () => {
  it('maps the baked record to the ESI shape, without asking ESI', async () => {
    mockedLoadTypeInfo.mockResolvedValue({
      description: 'Baked.',
      attributes: [
        [9, 350],
        [161, 27289],
      ],
      volume: 27289,
    });

    expect(await loadItemDetailType(RIFTER)).toEqual({
      description: 'Baked.',
      volume: 27289,
      dogma_attributes: [
        { attribute_id: 9, value: 350 },
        { attribute_id: 161, value: 27289 },
      ],
    });
    expect(mockedLoadUniverseTypeOnce).not.toHaveBeenCalled();
  });

  it('leaves volume absent when the baked record has none, as ESI does', async () => {
    mockedLoadTypeInfo.mockResolvedValue({ description: '', attributes: [] });

    expect(await loadItemDetailType(RIFTER)).toEqual({ description: '', dogma_attributes: [] });
  });

  it('falls back to the cached ESI read for a type the shard does not carry', async () => {
    mockedLoadTypeInfo.mockResolvedValue(null);
    mockedLoadUniverseTypeOnce.mockResolvedValue({
      data: esiRifter,
      fetchedAt: new Date(0),
      fromCache: true,
      truncated: false,
    });

    expect(await loadItemDetailType(RIFTER)).toEqual(esiRifter);
    expect(mockedLoadUniverseTypeOnce).toHaveBeenCalledWith(RIFTER);
  });

  it('falls back to the cached ESI read when the shard cannot be fetched', async () => {
    mockedLoadTypeInfo.mockRejectedValue(new TypeError('Failed to fetch'));
    mockedLoadUniverseTypeOnce.mockResolvedValue({
      data: esiRifter,
      fetchedAt: new Date(0),
      fromCache: true,
      truncated: false,
    });

    expect(await loadItemDetailType(RIFTER)).toEqual(esiRifter);
  });

  it('resolves null, never rejects, when neither source has the type', async () => {
    mockedLoadTypeInfo.mockRejectedValue(new TypeError('Failed to fetch'));
    mockedLoadUniverseTypeOnce.mockResolvedValue(null);

    expect(await loadItemDetailType(RIFTER)).toBeNull();
  });
});
