/**
 * The Appraisal's "Minus owned" preference: on/off, the station whose
 * hangars count, or every location. A null station follows the header's Trade Hub. Device-local.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export interface AppraisalOwnedPref {
  enabled: boolean;
  /** A Trade Hub's station id; null means the header hub's station. */
  stationId: number | null;
  /** Count stock wherever it sits, containers and structures included; `stationId` is then ignored. */
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
