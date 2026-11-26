import { createLocalSetting } from '@/lib/useLocalSetting';

export const LOCAL_GROUP_MODE_KEY = 'pilotLookupLocalGrouping';

export type LocalGroupMode = 'kills' | 'organization';

export const useLocalGroupMode = createLocalSetting<LocalGroupMode>({
  key: LOCAL_GROUP_MODE_KEY,
  defaultValue: 'kills',
  parse: (raw) => (raw === 'kills' || raw === 'organization' ? raw : null),
});
