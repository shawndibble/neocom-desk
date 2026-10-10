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
import {
  defaultHiddenNav,
  hiddenNavForActivities,
  parseHiddenNav,
  parseRecentNav,
  pushRecentNav,
} from './navRail';

export const useHiddenNav = createSyncedSetting<readonly string[]>({
  key: 'sync.navHidden',
  // The short rail: a pilot who never answered the first-run question sees it.
  defaultValue: defaultHiddenNav(),
  parse: parseHiddenNav,
});

/** Whether the first-run "What do you do in EVE?" question was answered or skipped. */
export const useNavSetupAnswered = createSyncedSetting<boolean>({
  key: 'sync.navSetupAnswered',
  defaultValue: false,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});

/**
 * Settles the first-run question: writes the starting hidden list and the flag
 * together, so a second device pulling the flag never asks again. Skipping
 * (no activities) gives the default set.
 */
export async function answerNavSetup(activities: readonly string[]): Promise<void> {
  await useHiddenNav.getState().setValue(hiddenNavForActivities(activities));
  await useNavSetupAnswered.getState().setValue(true);
}

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

/**
 * Records a visit to `viewPath` at the front of the Recent row. Waits for the
 * stored list first: the first visit of a cold load lands before `App`'s
 * hydrate, and writing onto the empty default would wipe the history.
 */
export async function recordRecentNav(viewPath: string): Promise<void> {
  if (!useRecentNav.getState().hydrated) await useRecentNav.getState().hydrate();
  const { value, setValue } = useRecentNav.getState();
  if (value[0] === viewPath) return;
  await setValue(pushRecentNav(value, viewPath));
}
