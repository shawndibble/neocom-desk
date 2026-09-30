/**
 * Every navigable destination, described once: the desktop rail, the phone's
 * tab bar and More sheet (`lib/mobileTabs.ts`), and (from #2318) the command palette all
 * read this list, so adding a page to the nav is one edit here.
 *
 * Pure data plus a pure listing function — no React, no Dexie. The two live
 * reads a destination depends on (the Character's scope locks and whether the
 * Corp entry shows) are the caller's: `useLockedRoutes(NAV_LOCK_PATHS)` and
 * `useCorpNavVisible()`.
 *
 * Tabs are not repeated here: a tabbed page's tabs come from `PAGE_TABS`
 * (`pageTabs.ts`, ADR 0015), linked by `tabPath`.
 */
import { tabBarTabs, tabPath } from '@/lib/pageTabs';
import { PAGE_TABS } from './pageTabs';
import type { CorpCapabilities } from '@/engine/corpRoles';
import type { AppRoutePath } from './routeScopes';

/**
 * - `scope`: an ordinary page; a missing grant marks it locked (never hidden,
 *   never disabled — the route's `ScopeGate` explains).
 * - `corp`: hidden, not locked, unless the Character's Corp Access is ready and
 *   its corporation known (CONTEXT.md round 35) — an amber dot would offer a
 *   re-login for a role only CCP can grant.
 * - `ungated`: needs no scope at all (routeScopes.ts `UNGATED`).
 */
export type NavGating = 'scope' | 'corp' | 'ungated';

/**
 * `primary` sits at the top of the rail with no heading; `footer` is pinned
 * below the scrolling rail (Settings, then the Character link).
 */
export type NavGroupId = 'primary' | 'progression' | 'economy' | 'social' | 'footer';

export interface NavGroup {
  readonly id: NavGroupId;
  /** The rail's small heading over the group; `null` draws none. Literal keys, so the locale split can find them. */
  readonly labelKey: string | null;
}

export const NAV_GROUPS = [
  /*
   * No heading: Corp sits in this group, and a heading over a
   * conditionally-rendered item would strand itself for the ~95% of users who
   * never see the item.
   */
  { id: 'primary', labelKey: null },
  { id: 'progression', labelKey: 'nav.groups.progression' },
  { id: 'economy', labelKey: 'nav.groups.economy' },
  { id: 'social', labelKey: 'nav.groups.social' },
  { id: 'footer', labelKey: null },
] as const satisfies readonly NavGroup[];

export interface NavPage {
  readonly path: AppRoutePath;
  /** `nav.*` i18n key — the one name the destination goes by everywhere. */
  readonly labelKey: string;
  readonly group: NavGroupId;
  readonly gating: NavGating;
  /**
   * Whether the phone's tab bar may hold it. `/corp` may not — it hides
   * rather than locks, so a chosen `/corp` would leave a hole in the bar on
   * every Character without corp access — and `/settings` may not, because it
   * has a permanent row in the More sheet. Both keep their sheet rows.
   */
  readonly mobileTab: boolean;
  /** Tab ids listed nowhere as destinations: a redirect alias, not a view of this page. */
  readonly aliasTabs?: readonly string[];
  /** Tab ids shown only while the Corp entry is (`visibleSettingsGroups`' Corporation section). */
  readonly corpTabs?: readonly string[];
  /**
   * Views that are routes of their own but live in this page's sub-nav rather
   * than its `PAGE_TABS` (`OverviewSubNav`, `CorpSubNav`). Listed as the
   * page's tabs; each carries its own route's lock.
   */
  readonly subViews?: readonly NavSubView[];
}

/** The Corp Capabilities a Corp sub-view is gated on — hidden, not locked, without one. */
export type CorpViewCapability = 'canReadMembers' | 'canReadWallet' | 'canReadAssets';

export interface NavSubView {
  readonly path: AppRoutePath;
  readonly labelKey: string;
  /** For a Corp view: the capability `CorpSubNav` shows it for. */
  readonly corpCapability?: CorpViewCapability;
}

/**
 * Every page, in the desktop rail's order — which is also the phone's
 * canonical tab order and the More sheet's order (`lib/mobileTabs.ts`).
 */
export const NAV_PAGES = [
  {
    path: '/overview',
    labelKey: 'nav.overview',
    group: 'primary',
    gating: 'scope',
    mobileTab: true,
    subViews: [
      { path: '/clones', labelKey: 'nav.clones' },
      { path: '/employment-history', labelKey: 'nav.employmentHistory' },
    ],
  },
  /*
   * Under Overview, not in Social: an alert is what the board is summarising,
   * and the two are read in that order. Mail and calendar are correspondence —
   * things other people sent you on purpose — which is a different errand.
   */
  { path: '/alerts', labelKey: 'nav.alerts', group: 'primary', gating: 'scope', mobileTab: true },
  /*
   * Beside Overview rather than inside a group: the two are the same kind of
   * destination — "this pilot" and "this corporation" — and the Corp section
   * has sub-navigation of its own for the views under it (`CorpSubNav`).
   */
  {
    path: '/corp',
    labelKey: 'nav.corp',
    group: 'primary',
    gating: 'corp',
    mobileTab: false,
    subViews: [
      { path: '/corp/members', labelKey: 'corp.membersTab', corpCapability: 'canReadMembers' },
      { path: '/corp/wallet', labelKey: 'corp.walletTab', corpCapability: 'canReadWallet' },
      { path: '/corp/assets', labelKey: 'corp.assetsTab', corpCapability: 'canReadAssets' },
    ],
  },
  {
    path: '/skills',
    labelKey: 'nav.skills',
    group: 'progression',
    gating: 'scope',
    mobileTab: true,
  },
  {
    path: '/industry',
    labelKey: 'nav.industry',
    group: 'progression',
    gating: 'scope',
    mobileTab: true,
  },
  { path: '/ships', labelKey: 'nav.ships', group: 'progression', gating: 'scope', mobileTab: true },
  {
    path: '/mining',
    labelKey: 'nav.miningTax',
    group: 'progression',
    gating: 'scope',
    mobileTab: true,
  },
  {
    path: '/planetary-industry',
    labelKey: 'nav.pi',
    group: 'progression',
    gating: 'scope',
    mobileTab: true,
  },
  /*
   * Leads Economy: it is the one economy view that answers a question before
   * you own anything, and the only one here that isn't Character-scoped.
   */
  { path: '/market', labelKey: 'nav.market', group: 'economy', gating: 'scope', mobileTab: true },
  {
    path: '/wallet',
    labelKey: 'nav.wallet',
    group: 'economy',
    gating: 'scope',
    mobileTab: true,
    // Sends an old link on to Market › Transactions (`WALLET_TABS`).
    aliasTabs: ['transactions'],
  },
  { path: '/assets', labelKey: 'nav.assets', group: 'economy', gating: 'scope', mobileTab: true },
  {
    path: '/contracts',
    labelKey: 'nav.contracts',
    group: 'economy',
    gating: 'scope',
    mobileTab: true,
  },
  { path: '/mail', labelKey: 'nav.mail', group: 'social', gating: 'scope', mobileTab: true },
  {
    path: '/calendar',
    labelKey: 'nav.calendar',
    group: 'social',
    gating: 'scope',
    mobileTab: true,
  },
  {
    path: '/contacts',
    labelKey: 'nav.contacts',
    group: 'social',
    gating: 'scope',
    mobileTab: true,
  },
  {
    path: '/settings',
    labelKey: 'nav.settings',
    group: 'footer',
    gating: 'ungated',
    mobileTab: false,
    corpTabs: ['corporation'],
  },
  /*
   * Last: on the rail it is reached only via `CharacterFooterLink`'s portrait,
   * and last is where it already sits at the end of the More sheet (#1764).
   */
  {
    path: '/characters',
    labelKey: 'nav.characters',
    group: 'footer',
    gating: 'ungated',
    mobileTab: true,
  },
] as const satisfies readonly NavPage[];

export type NavPagePath = (typeof NAV_PAGES)[number]['path'];

/**
 * Every scope-gated destination the shell asks `useLockedRoutes` about: the
 * scope-gated pages (the rail's amber lock dots) and their sub-views. Corp
 * paths are absent — corp hides rather than locks. Module-level, so the
 * hook's memo sees one array.
 */
export const NAV_LOCK_PATHS: readonly AppRoutePath[] = (NAV_PAGES as readonly NavPage[])
  .filter((page) => page.gating === 'scope')
  .flatMap((page) => [page.path, ...(page.subViews ?? []).map((view) => view.path)]);

const LABEL_KEY_BY_PATH = Object.fromEntries(
  NAV_PAGES.map((page) => [page.path, page.labelKey])
) as Record<NavPagePath, string>;

/** The `nav.*` key for a page in the descriptor. */
export function navPageLabelKey(path: NavPagePath): string {
  return LABEL_KEY_BY_PATH[path];
}

export interface RailGroup {
  readonly id: NavGroupId;
  readonly labelKey: string | null;
  readonly pages: readonly NavPage[];
}

/** The desktop rail's scrolling groups, in order; the footer is placed by hand. */
export function railGroups(): RailGroup[] {
  return NAV_GROUPS.filter((group) => group.id !== 'footer').map((group) => ({
    id: group.id,
    labelKey: group.labelKey,
    pages: NAV_PAGES.filter((page) => page.group === group.id),
  }));
}

export interface NavDestination {
  readonly kind: 'page' | 'tab';
  /** Where the link goes: the page path, or `tabPath` for a tab. */
  readonly path: string;
  /** The page it belongs to — itself, for a page. */
  readonly pagePath: AppRoutePath;
  readonly labelKey: string;
  readonly label: string;
  /** "Industry › Opportunities" for a tab; the page's own label for a page. */
  readonly breadcrumb: string;
  /** A `PAGE_TABS` tab carries its page's lock (the gate is on the route); a sub-view, its own route's. */
  readonly locked: boolean;
  /** The page's gating: a `corp` entry is only ever listed while visible, never locked. */
  readonly gating: NavGating;
}

export interface ListNavDestinationsOptions {
  readonly locked: ReadonlySet<AppRoutePath>;
  /** `useCorpNavVisible()` — `/corp` is left out entirely, never locked, when false. */
  readonly corpVisible: boolean;
  /** `useCorpAccess().capabilities` — each Corp view shows only for its capability, as in `CorpSubNav`. */
  readonly corpCapabilities: Pick<CorpCapabilities, CorpViewCapability>;
  readonly t: (key: string) => string;
}

export const BREADCRUMB_SEPARATOR = ' › ';

/**
 * Every page and page tab a pilot can navigate to, in nav order, each page
 * followed by its tabs and then its sub-views. Standalone tabs (a page of
 * their own below a tab, like the Fitting editor) and redirect-only aliases
 * are left out; corp-only entries are left out, never locked, when hidden.
 */
export function listNavDestinations({
  locked,
  corpVisible,
  corpCapabilities,
  t,
}: ListNavDestinationsOptions): NavDestination[] {
  const out: NavDestination[] = [];
  for (const page of NAV_PAGES as readonly NavPage[]) {
    if (page.gating === 'corp' && !corpVisible) continue;
    const pageLocked = page.gating === 'scope' && locked.has(page.path);
    const pageLabel = t(page.labelKey);
    out.push({
      kind: 'page',
      path: page.path,
      pagePath: page.path,
      labelKey: page.labelKey,
      label: pageLabel,
      breadcrumb: pageLabel,
      locked: pageLocked,
      gating: page.gating,
    });
    const tabEntry = (path: string, labelKey: string, tabLocked: boolean): NavDestination => {
      const label = t(labelKey);
      return {
        kind: 'tab',
        path,
        pagePath: page.path,
        labelKey,
        label,
        breadcrumb: `${pageLabel}${BREADCRUMB_SEPARATOR}${label}`,
        locked: tabLocked,
        gating: page.gating,
      };
    };
    const tabs = PAGE_TABS[page.path];
    if (tabs) {
      for (const tab of tabBarTabs(tabs)) {
        if (page.aliasTabs?.includes(tab.id)) continue;
        if (page.corpTabs?.includes(tab.id) && !corpVisible) continue;
        out.push(tabEntry(tabPath(tabs, tab.id), tab.labelKey, pageLocked));
      }
    }
    for (const view of page.subViews ?? []) {
      if (view.corpCapability && !corpCapabilities[view.corpCapability]) continue;
      out.push(tabEntry(view.path, view.labelKey, locked.has(view.path)));
    }
  }
  return out;
}
