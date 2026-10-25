/**
 * Which solar systems have an NPC station that runs industry jobs, from ESI's
 * public facility list. The list is static between expansions, so one read
 * serves the session. `null` is the offline signal: callers then skip the
 * filter rather than treat every system as having no station.
 */
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
