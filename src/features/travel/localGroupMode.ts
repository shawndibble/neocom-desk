/**
 * How Pilot Lookup's Local list is grouped (issue #5668): by what each pilot
 * has killed (the default, decision `20261008-143948`) or by alliance and
 * corporation. Device-local, remembered across visits, never synced.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const LOCAL_GROUP_MODE_KEY = 'pilotLookupLocalGrouping';

export type LocalGroupMode = 'kills' | 'organization';

export const useLocalGroupMode = createLocalSetting<LocalGroupMode>({
  key: LOCAL_GROUP_MODE_KEY,
  defaultValue: 'kills',
  parse: (raw) => (raw === 'kills' || raw === 'organization' ? raw : null),
});
