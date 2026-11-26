import { createLocalSetting } from '@/lib/useLocalSetting';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { parseHiddenNav, parseRecentNav, pushRecentNav } from './navRail';

export const useHiddenNav = createSyncedSetting<readonly string[]>({
  key: 'sync.navHidden',
  defaultValue: [],
  parse: parseHiddenNav,
});

export const useRecentNav = createLocalSetting<readonly string[]>({
  key: 'navRecent',
  defaultValue: [],
  parse: parseRecentNav,
});

export function toggleHiddenNav(path: string): void {
  const { value, setValue } = useHiddenNav.getState();
  const next = value.includes(path) ? value.filter((entry) => entry !== path) : [...value, path];
  void setValue(parseHiddenNav(next) ?? []);
}

export async function recordRecentNav(viewPath: string): Promise<void> {
  if (!useRecentNav.getState().hydrated) await useRecentNav.getState().hydrate();
  const { value, setValue } = useRecentNav.getState();
  if (value[0] === viewPath) return;
  await setValue(pushRecentNav(value, viewPath));
}
