import { getIndustryFacilities } from '@/esi/endpoints';
import { memoizeAsync } from '@/lib/memoizeAsync';

export const loadNpcIndustrySystems = memoizeAsync(
  async (): Promise<ReadonlySet<number>> => {
    const result = await getIndustryFacilities();
    if (!result.data) throw new Error('industry facilities unavailable');
    return new Set(result.data.map((facility) => facility.solar_system_id));
  },
  { fallback: null }
);
