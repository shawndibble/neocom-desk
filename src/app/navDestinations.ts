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
 *   its corporation known (GLOSSARY.md round 35) — an amber dot would offer a
 *   re-login for a role only CCP can grant.
 * - `ungated`: needs no scope at all (routeScopes.ts `UNGATED`).
 */
export type NavGating = 'scope' | 'corp' | 'ungated';

/**
 * `primary` sits at the top of the rail with no heading; `corp` follows it,
 * headed, and renders only while Corp Access is ready; `footer` is pinned
 * below the scrolling rail (Settings, then the Character link).
 */
export type NavGroupId = 'primary' | 'corp' | 'progression' | 'economy' | 'social' | 'footer';

export interface NavGroup {
  readonly id: NavGroupId;
  /** The rail's small heading over the group; `null` draws none. Literal keys, so the locale split can find them. */
  readonly labelKey: string | null;
}

export const NAV_GROUPS = [
  { id: 'primary', labelKey: null },
  /*
   * The whole group, heading included, renders only while Corp Access is
   * ready (`isNavPageAvailable`), so the heading never strands itself over
   * nothing for the pilots who never see Corp.
   */
  { id: 'corp', labelKey: 'nav.groups.corp' },
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
   * Whether the phone's tab bar may hold it. A Corp page may not — it hides
   * rather than locks, so a chosen one would leave a hole in the bar on
   * every Character without corp access — and `/settings` may not, because it
   * has a permanent row in the More sheet. Both keep their sheet rows.
   */
  readonly mobileTab: boolean;
  /** `false` leaves the page out of `railGroups()`: reached by a header control or Ctrl K instead. */
  readonly inRail?: false;
  /** Tab ids listed nowhere as destinations: a redirect alias, not a view of this page. */
  readonly aliasTabs?: readonly string[];
  /**
   * The page's `PAGE_TABS` are URL state behind an in-page control, not views
   * of their own: the nav lists the page alone (Contacts' This character / All
   * characters is a `CharacterFilterControl`, #2427, but `/contacts/across`
   * links still resolve).
   */
  readonly tablessNav?: true;
  /** Tab ids shown only while the Corp entry is (`visibleSettingsGroups`' Corporation section). */
  readonly corpTabs?: readonly string[];
  /** For a Corp page: the capability it is listed for. Hidden, never locked, without it. */
  readonly corpCapability?: CorpViewCapability;
  /** For a Corp page: tab ids listed only with the given capability (Members › Roles). */
  readonly corpTabCapabilities?: Readonly<Record<string, CorpViewCapability>>;
  /**
   * Views that are routes of their own but live in this page's sub-nav rather
   * than its `PAGE_TABS` (`OverviewSubNav`). Listed as the
   * page's tabs; each carries its own route's lock.
   */
  readonly subViews?: readonly NavSubView[];
}

/** The Corp Capabilities a Corp page or tab is gated on — hidden, not locked, without one. */
export type CorpViewCapability =
  'canReadMembers' | 'canReadWallet' | 'canReadAssets' | 'canReadMiningLedger' | 'canReadRoleAudit';

export interface NavSubView {
  readonly path: AppRoutePath;
  readonly labelKey: string;
  /** i18n keys of other names it goes by: the palette also matches these (Wallet › LP Store ← "loyalty points"). */
  readonly searchKeys?: readonly string[];
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
   * No rail row, no phone tab or sheet row: the bell in every page header
   * (`AlertsBell`) is the way in. This entry survives for Ctrl K and the `a`
   * shortcut: `/alerts` redirects to the Overview with the panel open.
   */
  {
    path: '/alerts',
    labelKey: 'nav.alerts',
    group: 'primary',
    gating: 'scope',
    mobileTab: false,
    inRail: false,
  },
  /*
   * The Corporation group: its own pages, each with a name that stands alone
   * (scope decision `20261021-160721-corporation-becomes-a-rail-group-of-its-own`).
   * Members' and Moons' tabs are their `PAGE_TABS`, listed under the open page.
   * Moons' Extractions tab is listed always: whether it shows needs the Corp
   * Tax Book, which only the page loads, and the page redirects away if not.
   */
  {
    path: '/corp',
    labelKey: 'nav.corpBoard',
    group: 'corp',
    gating: 'corp',
    mobileTab: false,
  },
  {
    path: '/corp/members',
    labelKey: 'nav.corpMembers',
    group: 'corp',
    gating: 'corp',
    mobileTab: false,
    corpCapability: 'canReadMembers',
    corpTabCapabilities: { roles: 'canReadRoleAudit' },
  },
  {
    path: '/corp/wallet',
    labelKey: 'nav.corpWallet',
    group: 'corp',
    gating: 'corp',
    mobileTab: false,
    corpCapability: 'canReadWallet',
  },
  {
    path: '/corp/assets',
    labelKey: 'nav.corpAssets',
    group: 'corp',
    gating: 'corp',
    mobileTab: false,
    corpCapability: 'canReadAssets',
  },
  {
    path: '/corp/moons',
    labelKey: 'nav.corpMoons',
    group: 'corp',
    gating: 'corp',
    mobileTab: false,
    corpCapability: 'canReadMiningLedger',
  },
  {
    path: '/skills',
    labelKey: 'nav.skills',
    group: 'progression',
    gating: 'scope',
    mobileTab: true,
    // Routes of their own (`SkillsSubNav`); `/skills` itself redirects to Plans.
    subViews: [
      { path: '/skills/plans', labelKey: 'skills.plansTab' },
      { path: '/skills/trained', labelKey: 'skills.trainedTab' },
      { path: '/skills/certificates', labelKey: 'skills.certificatesTab' },
    ],
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
   * `ungated` rather than `scope`: every read is public ESI or the local
   * stargate graph, so there is no grant whose absence could lock it. Last in
   * Progression, which took it in with Pilot Lookup (a Travel tab) when the
   * Intel heading went.
   */
  {
    path: '/travel',
    labelKey: 'nav.travel',
    group: 'progression',
    gating: 'ungated',
    mobileTab: true,
  },
  /*
   * Leads Economy: it is the one economy view that answers a question before
   * you own anything, and the only one here that isn't Character-scoped.
   */
  {
    path: '/market',
    labelKey: 'nav.market',
    group: 'economy',
    gating: 'scope',
    mobileTab: true,
  },
  {
    path: '/wallet',
    labelKey: 'nav.wallet',
    group: 'economy',
    gating: 'scope',
    mobileTab: true,
    // Sends an old link on to Market › Transactions (`WALLET_TABS`). LP Store is
    // a Wallet tab beside the balances it spends (#3527; it was a Market tab).
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
    tablessNav: true,
  },
  // Communities: Firebase-backed, no ESI scope of its own.
  {
    path: '/communities',
    labelKey: 'nav.communities',
    group: 'social',
    gating: 'ungated',
    mobileTab: true,
  },
  /*
   * Help is not a setting: FAQ and Support left Settings for this footer page.
   * Like Settings, it keeps a permanent row in the More sheet rather than a
   * bar slot.
   */
  {
    path: '/help',
    labelKey: 'nav.help',
    group: 'footer',
    gating: 'ungated',
    mobileTab: false,
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

export interface NavTab {
  readonly id: string;
  readonly labelKey: string;
  readonly path: string;
}

/**
 * The `PAGE_TABS` tabs the nav lists under a page: the tab bar's tabs, less
 * redirect aliases, and none at all for a `tablessNav` page. The one rule the
 * destination list and the rail's path ownership (`navRail.ts`) both read.
 */
export function navTabs(page: NavPage): readonly NavTab[] {
  const tabs = page.tablessNav ? undefined : PAGE_TABS[page.path];
  if (!tabs) return [];
  return tabBarTabs(tabs)
    .filter((tab) => !page.aliasTabs?.includes(tab.id))
    .map((tab) => ({ id: tab.id, labelKey: tab.labelKey, path: tabPath(tabs, tab.id) }));
}

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

/**
 * Pages whose path is the parent of another page's (`/corp` over
 * `/corp/wallet`). Their links match exactly, or Corp Board would read as
 * current on every Corp page; every other page stays current on its own tabs.
 */
export const PARENT_PAGE_PATHS: ReadonlySet<string> = new Set(
  NAV_PAGES.map((page) => page.path as string).filter((path) =>
    NAV_PAGES.some((other) => other.path.startsWith(`${path}/`))
  )
);

/** The `nav.*` key for a page in the descriptor. */
export function navPageLabelKey(path: NavPagePath): string {
  return LABEL_KEY_BY_PATH[path];
}

/**
 * Whether a page is listed at all right now: a Corp page needs Corp Access
 * ready and its own Corp Capability; every other page always is.
 */
export function isNavPageAvailable(
  page: NavPage,
  corpVisible: boolean,
  corpCapabilities: Partial<Record<CorpViewCapability, boolean>>
): boolean {
  if (page.gating !== 'corp') return true;
  return corpVisible && (!page.corpCapability || corpCapabilities[page.corpCapability] === true);
}

export interface RailGroup {
  readonly id: NavGroupId;
  readonly labelKey: string | null;
  readonly pages: readonly NavPage[];
}

/**
 * The desktop rail's scrolling groups, in order; the footer is placed by hand.
 */
export function railGroups(): RailGroup[] {
  return NAV_GROUPS.filter((group) => group.id !== 'footer').map((group) => ({
    id: group.id,
    labelKey: group.labelKey,
    pages: NAV_PAGES.filter(
      (page) => group.id === page.group && (page as NavPage).inRail !== false
    ),
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
  /** Translated alternate names the palette matches after the label and breadcrumb. */
  readonly keywords?: readonly string[];
}

export interface ListNavDestinationsOptions {
  readonly locked: ReadonlySet<AppRoutePath>;
  /** `useCorpNavVisible()` — every Corp page is left out entirely, never locked, when false. */
  readonly corpVisible: boolean;
  /** `useCorpAccess().capabilities` — each Corp view shows only for its capability, as the Corp pages and Roles tab are gated. */
  readonly corpCapabilities: Pick<CorpCapabilities, CorpViewCapability>;
  readonly t: (key: string) => string;
  /** Tab paths left out for now (Industry › Logs until a Production Run is logged). */
  readonly hiddenTabPaths?: ReadonlySet<string>;
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
  hiddenTabPaths,
}: ListNavDestinationsOptions): NavDestination[] {
  const out: NavDestination[] = [];
  for (const page of NAV_PAGES as readonly NavPage[]) {
    if (!isNavPageAvailable(page, corpVisible, corpCapabilities)) continue;
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
    const tabEntry = (
      path: string,
      labelKey: string,
      tabLocked: boolean,
      searchKeys?: readonly string[]
    ): NavDestination => {
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
        ...(searchKeys && { keywords: searchKeys.map(t) }),
      };
    };
    // Members without the role audit has one tab and draws no tab bar: list none.
    const allTabs = navTabs(page);
    const shownTabs = page.corpTabCapabilities
      ? allTabs.filter((tab) => {
          const needed = page.corpTabCapabilities?.[tab.id];
          return !needed || corpCapabilities[needed];
        })
      : allTabs;
    for (const tab of page.corpTabCapabilities && shownTabs.length < 2 ? [] : shownTabs) {
      if (page.corpTabs?.includes(tab.id) && !corpVisible) continue;
      if (hiddenTabPaths?.has(tab.path)) continue;
      out.push(tabEntry(tab.path, tab.labelKey, pageLocked));
    }
    for (const view of page.subViews ?? []) {
      out.push(tabEntry(view.path, view.labelKey, locked.has(view.path), view.searchKeys));
    }
  }
  return out;
}
