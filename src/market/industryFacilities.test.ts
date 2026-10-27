import { beforeEach, describe, expect, it, vi } from 'vitest';

const getIndustryFacilities = vi.fn();
vi.mock('@/esi/endpoints', () => ({
  getIndustryFacilities: (...args: unknown[]) => getIndustryFacilities(...args),
}));

import { loadNpcIndustrySystems } from './industryFacilities';

describe('loadNpcIndustrySystems', () => {
  beforeEach(() => {
    loadNpcIndustrySystems.reset();
    getIndustryFacilities.mockReset();
  });

  it('collects the distinct systems that hold an industry station', async () => {
    getIndustryFacilities.mockResolvedValue({
      data: [
        { facility_id: 1, solar_system_id: 30000142 },
        { facility_id: 2, solar_system_id: 30000142 },
        { facility_id: 3, solar_system_id: 30002187 },
      ],
    });
    expect(await loadNpcIndustrySystems()).toEqual(new Set([30000142, 30002187]));
  });

  it('answers null when ESI is unreachable, and retries on the next call', async () => {
    getIndustryFacilities.mockRejectedValueOnce(new Error('offline'));
    expect(await loadNpcIndustrySystems()).toBeNull();
    getIndustryFacilities.mockResolvedValue({ data: [{ facility_id: 1, solar_system_id: 7 }] });
    expect(await loadNpcIndustrySystems()).toEqual(new Set([7]));
  });
});
