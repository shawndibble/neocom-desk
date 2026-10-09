/**
 * The Payee and rate the pilot last set on a moon-ore Survey. Local: the Payee
 * itself lives (and syncs) in the Moon Mining Tax records; this only keeps the
 * two fields filled between visits and between surveys of the same moon.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export interface SurveyTax {
  name: string;
  /** What was typed, so a half-typed rate isn't rewritten under the cursor. */
  pct: string;
}

export const useSurveyTax = createLocalSetting<SurveyTax>({
  key: 'miningSurveyTax',
  defaultValue: { name: '', pct: '' },
  parse: (raw) => {
    if (typeof raw !== 'object' || raw === null) return null;
    const { name, pct } = raw as { name?: unknown; pct?: unknown };
    return typeof name === 'string' && typeof pct === 'string' ? { name, pct } : null;
  },
});
