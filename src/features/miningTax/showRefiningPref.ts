/**
 * Device-local: whether the Mining Yield Overview shows refined value at all
 * (issue #1281). Off for a pilot who never refines — hides refined value
 * everywhere on the page and skips the ESI calls only refining needs. Local,
 * not synced: the choice is about how this device's owner reads the page,
 * not a fact about the pilot.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const MINING_SHOW_REFINING_KEY = 'miningYieldShowRefining';

export const useMiningShowRefining = createLocalSetting<boolean>({
  key: MINING_SHOW_REFINING_KEY,
  defaultValue: true,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});
