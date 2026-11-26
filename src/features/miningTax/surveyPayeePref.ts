import { createLocalSetting } from '@/lib/useLocalSetting';

export const useSurveyPayeeId = createLocalSetting<string | null>({
  key: 'miningTaxSurveyPayeeId',
  defaultValue: null,
  parse: (raw) => (typeof raw === 'string' && raw !== '' ? raw : null),
});
