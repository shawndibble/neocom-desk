/**
 * The two stored lists behind the rail and the More sheet (scope decision
 * `20261002-145653-rail-opens-the-current-page-icons-hiding-and`):
 *
 * - **Hidden** pages and views — synced, because which parts of EVE a pilot
 *   plays is about the pilot, not the screen.
 * - **Recent** views — device-local, because it is this screen's history.
 */
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

/** Shows a hidden path again, or hides a shown one. */
export function toggleHiddenNav(path: string): void {
  const { value, setValue } = useHiddenNav.getState();
  const next = value.includes(path) ? value.filter((entry) => entry !== path) : [...value, path];
  void setValue(parseHiddenNav(next) ?? []);
}

/** Records a visit to `viewPath` at the front of the Recent row. */
export function recordRecentNav(viewPath: string): void {
  const { value, setValue } = useRecentNav.getState();
  if (value[0] === viewPath) return;
  void setValue(pushRecentNav(value, viewPath));
}
