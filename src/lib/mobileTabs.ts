/**
 * Which destinations the phone's bottom tab bar holds — a **device-local**
 * preference, never synced (`createLocalSetting`, which rejects the `sync.`
 * prefix outright). A pilot's phone and their desktop browser are different
 * screens with different reach; only the phone has this bar at all, so a
 * choice made on one has nothing to say about the other.
 *
 * Two invariants the rest of the nav leans on:
 *
 * - **Exactly `MOBILE_TAB_COUNT` paths.** `Layout`'s `MOBILE_NAV_ITEM` splits
 *   a viewport that can be as narrow as ~320px into equal shares; three would
 *   leave the bar looking unfinished and six would truncate every label to
 *   nothing. A stored value of any other length is discarded, not padded.
 * - **Canonical order, not the order they were picked.** The bar is the
 *   desktop rail's order with gaps in it — one order to learn, not two — so
 *   `sortMobileTabs` re-sorts whatever the Settings chips hand over.
 *
 * The More sheet renders `mobileSheetPaths` — the complement — so a path is in
 * exactly one of the two places, by construction rather than by upkeep: two
 * hand-kept lists eventually leave a route in neither, which on a phone means
 * unreachable.
 */
import type { AppRoutePath } from '@/app/routeScopes';
import { createLocalSetting } from './useLocalSetting';

export const MOBILE_TABS_KEY = 'mobileTabs';

/**
 * Every path that may take a tab, in the desktop rail's order — which is also
 * the order the More sheet lists whatever is left.
 *
 * Deliberately its own list rather than a reuse of `Layout`'s `NAV_PATHS`:
 * that one answers "does this draw a lock dot", and the two questions will
 * drift. `/corp` is absent from both, for the same reason in each — corp UI
 * hides rather than locks, so a chosen `/corp` would leave a hole in the bar
 * on every Character without corp access. It keeps its permanent sheet row.
 */
export const MOBILE_TAB_CHOICES = [
  '/overview',
  '/alerts',
  '/skills',
  '/industry',
  '/moon-mining',
  '/planetary-industry',
  '/market',
  '/wallet',
  '/assets',
  '/contracts',
  '/mail',
  '/calendar',
  '/contacts',
] as const satisfies readonly AppRoutePath[];

export type MobileTabPath = (typeof MOBILE_TAB_CHOICES)[number];

/** Tabs in the bar, beside the "More" button that is always the fifth item. */
export const MOBILE_TAB_COUNT = 4;

/** What the bar held before it was settable, so nobody's phone moves unasked. */
export const DEFAULT_MOBILE_TABS: readonly MobileTabPath[] = [
  '/overview',
  '/alerts',
  '/skills',
  '/industry',
];

/** `nav.*` i18n key per path — the one name each destination goes by, read by the rail, the bar, the sheet and the picker. */
export const NAV_LABEL_KEYS: Record<MobileTabPath, string> = {
  '/overview': 'nav.overview',
  '/alerts': 'nav.alerts',
  '/skills': 'nav.skills',
  '/industry': 'nav.industry',
  '/moon-mining': 'nav.miningTax',
  '/planetary-industry': 'nav.pi',
  '/market': 'nav.market',
  '/wallet': 'nav.wallet',
  '/assets': 'nav.assets',
  '/contracts': 'nav.contracts',
  '/mail': 'nav.mail',
  '/calendar': 'nav.calendar',
  '/contacts': 'nav.contacts',
};

function isMobileTabPath(value: unknown): value is MobileTabPath {
  return (MOBILE_TAB_CHOICES as readonly string[]).includes(value as string);
}

/** Canonical order, and known paths only — it filters the choices, not the input. */
export function sortMobileTabs(paths: readonly MobileTabPath[]): MobileTabPath[] {
  return MOBILE_TAB_CHOICES.filter((path) => paths.includes(path));
}

/**
 * The bar to render for a set held in memory. `parseMobileTabs` vets what is
 * stored; this vets what `setValue` was handed, which it accepts unchecked —
 * a short bar would otherwise render with a hole this session and snap back to
 * the default on the next cold load, with nothing to say why.
 */
export function barTabs(tabs: readonly MobileTabPath[]): MobileTabPath[] {
  return parseMobileTabs([...tabs]) ?? [...DEFAULT_MOBILE_TABS];
}

/** The sheet's rows: everything the bar does not hold, in canonical order. */
export function mobileSheetPaths(tabs: readonly MobileTabPath[]): MobileTabPath[] {
  return MOBILE_TAB_CHOICES.filter((path) => !tabs.includes(path));
}

/**
 * Accepts a row only if it is exactly the bar the invariants describe:
 * `MOBILE_TAB_COUNT` known paths, no repeats. A hand-edited row, a path this
 * version dropped, a value written by a later one — all rejected.
 *
 * Order is repaired rather than rejected: a valid set stored the other way
 * round is still the pilot's choice.
 */
export function parseMobileTabs(raw: unknown): MobileTabPath[] | null {
  if (!Array.isArray(raw) || raw.length !== MOBILE_TAB_COUNT) return null;
  if (!raw.every(isMobileTabPath)) return null;
  if (new Set(raw).size !== raw.length) return null;
  return sortMobileTabs(raw);
}

export const useMobileTabs = createLocalSetting<readonly MobileTabPath[]>({
  key: MOBILE_TABS_KEY,
  defaultValue: DEFAULT_MOBILE_TABS,
  parse: parseMobileTabs,
});
