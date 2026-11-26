import { createLocalSetting } from '@/lib/useLocalSetting';

export const useAutoContinueSessions = createLocalSetting<boolean>({
  key: 'miningTaxAutoContinue',
  defaultValue: false,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});

export const useDismissedContinuations = createLocalSetting<string[]>({
  key: 'miningTaxDismissedContinuations',
  defaultValue: [],
  parse: (raw) => (Array.isArray(raw) && raw.every((key) => typeof key === 'string') ? raw : null),
});
