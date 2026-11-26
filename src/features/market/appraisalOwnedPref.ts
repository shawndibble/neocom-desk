import type { EsiEndpointId } from '@/esi/registry';
import { createLocalSetting } from '@/lib/useLocalSetting';

export interface AppraisalOwnedPref {
  enabled: boolean;
  stationId: number | null;
  everywhere: boolean;
}

export const DEFAULT_APPRAISAL_OWNED_PREF: AppraisalOwnedPref = {
  enabled: false,
  stationId: null,
  everywhere: false,
};

export const useAppraisalOwnedPref = createLocalSetting<AppraisalOwnedPref>({
  key: 'appraisalMinusOwned',
  defaultValue: DEFAULT_APPRAISAL_OWNED_PREF,
  parse: (raw) => {
    if (raw === null || typeof raw !== 'object') return null;
    const { enabled, stationId, everywhere } = raw as Record<string, unknown>;
    if (typeof enabled !== 'boolean') return null;
    return {
      enabled,
      stationId: typeof stationId === 'number' && Number.isFinite(stationId) ? stationId : null,
      everywhere: everywhere === true,
    };
  },
});

export const ASSETS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterAssets'];

export const OWNED_EVERYWHERE = 'all' as const;
