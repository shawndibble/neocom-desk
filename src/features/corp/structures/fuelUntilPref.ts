import { createLocalSetting } from '@/lib/useLocalSetting';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const useFuelUntil = createLocalSetting<string | null>({
  key: 'corpStructuresFuelUntil',
  defaultValue: null,
  parse: (raw) => (typeof raw === 'string' && DATE.test(raw) ? raw : null),
});
