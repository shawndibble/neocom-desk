import { tabBarTabs, tabPath } from '@/lib/pageTabs';
import { PAGE_TABS } from './pageTabs';
import type { CorpCapabilities } from '@/engine/corpRoles';
import { TAB_ENDPOINTS, type AppRoutePath } from './routeScopes';

export type NavGating = 'scope' | 'corp' | 'ungated';

export type NavGroupId = 'primary' | 'corp' | 'progression' | 'economy' | 'social' | 'footer';

export interface NavGroup {
  readonly id: NavGroupId;
  readonly labelKey: string | null;
}

export const NAV_GROUPS = [
  { id: 'primary', labelKey: null },
  { id: 'corp', labelKey: 'nav.groups.corp' },
  { id: 'progression', labelKey: 'nav.groups.progression' },
  { id: 'economy', labelKey: 'nav.groups.economy' },
  { id: 'social', labelKey: 'nav.groups.social' },
  { id: 'footer', labelKey: null },
] as const satisfies readonly NavGroup[];

export interface NavPage {
  readonly path: AppRoutePath;
  readonly labelKey: string;
  readonly group: NavGroupId;
  readonly gating: NavGating;
  readonly mobileTab: boolean;
  readonly inRail?: false;
  readonly aliasTabs?: readonly string[];
  readonly controlTabs?: readonly string[];
  readonly corpTabs?: readonly string[];
  readonly corpCapability?: CorpViewCapability;
  readonly corpTabCapabilities?: Readonly<Record<string, CorpViewCapability>>;
  readonly conditionalTabs?: Readonly<Record<string, 'srp'>>;
  readonly subViews?: readonly NavSubView[];
}

export type CorpViewCapability =
  | 'canReadMembers'
  | 'canReadWallet'
  | 'canReadAssets'
  | 'canReadStructures'
  | 'canReadMiningLedger'
  | 'canReadRoleAudit'
  | 'canManageSrp'
  | 'canConfigureSrp'
  | 'canVet'
  | 'canConfigureVetting';

export interface NavSubView {
  readonly path: AppRoutePath;
  readonly labelKey: string;
  readonly searchKeys?: readonly string[];
  readonly visible?: 'srp';
}

export function isSubViewVisible(view: NavSubView, srpVisible: boolean): boolean {
  return view.visible !== 'srp' || srpVisible;
}

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
      { path: '/srp', labelKey: 'nav.srp', visible: 'srp' },
    ],
  },
  {
    path: '/alerts',
    labelKey: 'nav.alerts',
    group: 'primary',
    gating: 'scope',
    mobileTab: false,
    inRail: false,
  },
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
    path: '/corp/structures',
    labelKey: 'nav.corpStructures',
    group: 'corp',
    gating: 'corp',
    mobileTab: false,
    corpCapability: 'canReadStructures',
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
    path: '/corp/srp',
    labelKey: 'nav.corpSrp',
    group: 'corp',
    gating: 'corp',
    mobileTab: false,
    corpCapability: 'canManageSrp',
    conditionalTabs: { queue: 'srp' },
    corpTabCapabilities: { settings: 'canConfigureSrp' },
  },
  {
    path: '/corp/vetting',
    labelKey: 'nav.corpVetting',
    group: 'corp',
    gating: 'corp',
    mobileTab: false,
    corpCapability: 'canVet',
    corpTabCapabilities: { settings: 'canConfigureVetting' },
  },
  {
    path: '/skills',
    labelKey: 'nav.skills',
    group: 'progression',
    gating: 'scope',
    mobileTab: true,
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
  {
    path: '/travel',
    labelKey: 'nav.travel',
    group: 'progression',
    gating: 'ungated',
    mobileTab: true,
  },
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
    controlTabs: ['character', 'across'],
  },
  {
    path: '/communities',
    labelKey: 'nav.communities',
    group: 'social',
    gating: 'ungated',
    mobileTab: true,
  },
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

export function navTabs(page: NavPage): readonly NavTab[] {
  const tabs = PAGE_TABS[page.path];
  if (!tabs) return [];
  return tabBarTabs(tabs)
    .filter((tab) => !page.aliasTabs?.includes(tab.id) && !page.controlTabs?.includes(tab.id))
    .map((tab) => ({ id: tab.id, labelKey: tab.labelKey, path: tabPath(tabs, tab.id) }));
}

export const NAV_LOCK_PATHS: readonly string[] = [
  ...(NAV_PAGES as readonly NavPage[])
    .filter((page) => page.gating === 'scope')
    .flatMap((page) => [page.path, ...(page.subViews ?? []).map((view) => view.path)]),
  ...Object.keys(TAB_ENDPOINTS),
];

const LABEL_KEY_BY_PATH = Object.fromEntries(
  NAV_PAGES.map((page) => [page.path, page.labelKey])
) as Record<NavPagePath, string>;

export function navPageLabelKey(path: NavPagePath): string {
  return LABEL_KEY_BY_PATH[path];
}

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
  readonly path: string;
  readonly pagePath: AppRoutePath;
  readonly labelKey: string;
  readonly label: string;
  readonly breadcrumb: string;
  readonly locked: boolean;
  readonly gating: NavGating;
  readonly keywords?: readonly string[];
}

export interface ListNavDestinationsOptions {
  readonly locked: ReadonlySet<string>;
  readonly corpVisible: boolean;
  readonly corpCapabilities: Pick<CorpCapabilities, CorpViewCapability>;
  readonly srpVisible?: boolean;
  readonly t: (key: string) => string;
  readonly hiddenTabPaths?: ReadonlySet<string>;
}

export const BREADCRUMB_SEPARATOR = ' › ';

export function listNavDestinations({
  locked,
  corpVisible,
  corpCapabilities,
  srpVisible,
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
    const allTabs = navTabs(page);
    const narrowed = !!page.corpTabCapabilities || !!page.conditionalTabs;
    const shownTabs = narrowed
      ? allTabs.filter((tab) => {
          const needed = page.corpTabCapabilities?.[tab.id];
          return (
            (!needed || corpCapabilities[needed]) &&
            !(page.conditionalTabs?.[tab.id] && !srpVisible)
          );
        })
      : allTabs;
    for (const tab of narrowed && shownTabs.length < 2 ? [] : shownTabs) {
      if (page.corpTabs?.includes(tab.id) && !corpVisible) continue;
      if (hiddenTabPaths?.has(tab.path)) continue;
      out.push(tabEntry(tab.path, tab.labelKey, pageLocked || locked.has(tab.path)));
    }
    for (const view of page.subViews ?? []) {
      if (!isSubViewVisible(view, srpVisible === true)) continue;
      out.push(tabEntry(view.path, view.labelKey, locked.has(view.path), view.searchKeys));
    }
  }
  return out;
}
