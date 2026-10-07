/**
 * The Appraisal's "Minus owned" preference: on/off, and the station whose
 * hangars count. A null station follows the header's Trade Hub. Device-local.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export interface AppraisalOwnedPref {
  enabled: boolean;
  /** A Trade Hub's station id; null means the header hub's station. */
  stationId: number | null;
}

export const DEFAULT_APPRAISAL_OWNED_PREF: AppraisalOwnedPref = { enabled: false, stationId: null };

export const useAppraisalOwnedPref = createLocalSetting<AppraisalOwnedPref>({
  key: 'appraisalMinusOwned',
  defaultValue: DEFAULT_APPRAISAL_OWNED_PREF,
  parse: (raw) => {
    if (raw === null || typeof raw !== 'object') return null;
    const { enabled, stationId } = raw as Record<string, unknown>;
    if (typeof enabled !== 'boolean') return null;
    return {
      enabled,
      stationId: typeof stationId === 'number' && Number.isFinite(stationId) ? stationId : null,
    };
  },
});
