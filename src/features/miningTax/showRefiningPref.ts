import { createLocalSetting } from '@/lib/useLocalSetting';

export const MINING_SHOW_REFINING_KEY = 'miningYieldShowRefining';

export const useMiningShowRefining = createLocalSetting<boolean>({
  key: MINING_SHOW_REFINING_KEY,
  defaultValue: true,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});
