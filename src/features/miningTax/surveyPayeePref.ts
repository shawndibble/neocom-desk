/**
 * The Payee a Mining Survey last handed to this tab ("Open in Mining Tax"),
 * so the Assign dialog can preselect them when nothing better (the pilot's
 * history in that system) is known. Local, and only ever a suggestion.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const useSurveyPayeeId = createLocalSetting<string | null>({
  key: 'miningTaxSurveyPayeeId',
  defaultValue: null,
  parse: (raw) => (typeof raw === 'string' && raw !== '' ? raw : null),
});
