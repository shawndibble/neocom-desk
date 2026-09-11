/**
 * BPC Search's Space filter, remembered across visits (issue #796) — the
 * Moon Mining ledger's Status filter (`statusFilterPref.ts`) is the
 * precedent: it earns persistence because it hides rows, and forgetting it
 * would put a pilot who unchecked wormhole back to seeing every row on their
 * next visit with no sign anything is filtered.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';

export const SPACE_FILTER_SETTING_KEY = 'bpcSearchSpaceFilter';

/** All four checked by default — the filter is a no-op until the player unchecks something. */
export const DEFAULT_SPACE_FILTER: readonly SpaceKind[] = SPACE_KINDS;

function isSpaceKind(raw: unknown): raw is SpaceKind {
  return typeof raw === 'string' && (SPACE_KINDS as readonly string[]).includes(raw);
}

export const useSpaceFilter = createLocalSetting<readonly SpaceKind[]>({
  key: SPACE_FILTER_SETTING_KEY,
  defaultValue: DEFAULT_SPACE_FILTER,
  // An array, not a Set: Dexie stores plain structured-cloneable values.
  // An empty stored array is rejected rather than honoured — same reasoning
  // as `statusFilterPref.ts`'s guard — it would leave every row filtered out
  // with no explanation.
  parse: (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.every(isSpaceKind) ? (raw as SpaceKind[]) : null;
  },
});
