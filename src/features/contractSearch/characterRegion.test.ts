import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadCharacterRegionId } from './characterRegion';

const CHARACTER_ID = 42;

vi.mock('@/features/character/location', () => ({
  loadCharacterSolarSystemId: vi.fn(),
}));
vi.mock('@/sde/solarSystems', () => ({
  lookupSolarSystem: vi.fn(),
}));

const { loadCharacterSolarSystemId } = await import('@/features/character/location');
const { lookupSolarSystem } = await import('@/sde/solarSystems');
const mockLocation = vi.mocked(loadCharacterSolarSystemId);
const mockSystem = vi.mocked(lookupSolarSystem);

beforeEach(() => {
  mockLocation.mockReset();
  mockSystem.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('loadCharacterRegionId', () => {
  it('maps the current solar system to its region', async () => {
    mockLocation.mockResolvedValue(30000142);
    mockSystem.mockResolvedValue({
      id: 30000142,
      name: 'Jita',
      security: 0.9459,
      regionId: 10000002,
    });

    await expect(loadCharacterRegionId(CHARACTER_ID)).resolves.toBe(10000002);
    expect(mockSystem).toHaveBeenCalledWith(30000142);
  });

  it('returns null without touching the snapshot when the location is unresolvable', async () => {
    mockLocation.mockResolvedValue(null);

    await expect(loadCharacterRegionId(CHARACTER_ID)).resolves.toBeNull();
    expect(mockSystem).not.toHaveBeenCalled();
  });

  it('returns null when the snapshot cannot place the system', async () => {
    mockLocation.mockResolvedValue(30000142);
    mockSystem.mockResolvedValue(undefined);

    await expect(loadCharacterRegionId(CHARACTER_ID)).resolves.toBeNull();
  });
});
