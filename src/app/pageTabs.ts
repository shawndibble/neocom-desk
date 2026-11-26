import {
  definePageTabs,
  isIndexPath,
  isWithinPage,
  tabFromPathname,
  tabPath,
  type PageTabs,
} from '@/lib/pageTabs';
import { matchPath } from 'react-router-dom';
import { legacyAssetsLocation } from '@/engine/assetPath';
import { INDUSTRY_TABS } from '@/features/industry/industryTabs';
import { SHIPS_TABS } from '@/features/fittings/shipsTabs';
import { CORP_MEMBERS_TABS, legacyCorpMembersLocation } from '@/features/corp/corpMembersTabs';
import { MOONS_TABS, legacyMoonsLocation } from '@/features/corp/moons/moonsPaths';
import { SRP_TABS } from '@/features/corp/srp/srpTabs';
import { VETTING_TABS } from '@/features/corp/vetting/vettingTabs';
import { ROUTE_REQUIREMENTS, type AppRoutePath } from './routeScopes';

export const CONTACTS_TABS = definePageTabs('/contacts', [
  { id: 'character', labelKey: 'contacts.tabContacts' },
  { id: 'across', labelKey: 'contacts.tabAcrossCharacters' },
  { id: 'standings', labelKey: 'contacts.tabStandings' },
]);

export const TRAVEL_TABS = definePageTabs('/travel', [
  { id: 'route', labelKey: 'travel.routeTab' },
  { id: 'pilot', labelKey: 'nav.pilotLookup' },
]);

export const SETTINGS_TABS = definePageTabs(
  '/settings',
  [
    { id: 'display', labelKey: 'settings.tabs.display' },
    { id: 'notifications', labelKey: 'settings.tabs.notifications' },
    { id: 'industry', labelKey: 'settings.tabs.industry' },
    { id: 'pi', labelKey: 'settings.tabs.pi' },
    { id: 'market', labelKey: 'settings.tabs.market' },
    { id: 'miningTax', labelKey: 'settings.tabs.miningTax' },
    { id: 'characters', labelKey: 'settings.tabs.characters' },
    { id: 'corporation', labelKey: 'settings.tabs.corporation' },
    { id: 'travel', labelKey: 'settings.tabs.travel' },
    { id: 'permissions', labelKey: 'settings.tabs.permissions' },
    { id: 'app', labelKey: 'settings.tabs.app' },
    { id: 'device', labelKey: 'settings.tabs.device' },
    { id: 'dataAge', labelKey: 'settings.tabs.data' },
    { id: 'offline', labelKey: 'settings.tabs.offline' },
    { id: 'activity', labelKey: 'settings.tabs.activity' },
  ],
  undefined,
  { hiddenFrom: '(min-width: 48rem)' }
);

export const HELP_TABS = definePageTabs('/help', [
  { id: 'shortcuts', labelKey: 'settings.help.tabShortcuts' },
  { id: 'faq', labelKey: 'settings.help.tabFaq' },
  { id: 'support', labelKey: 'settings.help.tabSupport' },
]);

export const PI_TABS = definePageTabs('/planetary-industry', [
  { id: 'plan', labelKey: 'piPlan.planTab' },
  { id: 'map', labelKey: 'piPlan.mapTab' },
  { id: 'colonies', labelKey: 'piPlan.coloniesTab' },
]);

export const MINING_TABS = definePageTabs('/mining', [
  { id: 'overview', labelKey: 'miningTax.overviewTab' },
  { id: 'tax', labelKey: 'miningTax.taxTab' },
  { id: 'survey', labelKey: 'miningTax.surveyTab' },
]);

export const WALLET_TABS = definePageTabs('/wallet', [
  { id: 'balance', labelKey: 'wallet.balanceTab' },
  { id: 'journal', labelKey: 'wallet.journalTab' },
  { id: 'transactions', labelKey: 'market.sections.transactions' },
  { id: 'lp-store', labelKey: 'loyaltyStore.title' },
]);

export const CONTRACTS_TABS = definePageTabs(
  '/contracts',
  [
    { id: 'history', labelKey: 'contracts.historyTab' },
    { id: 'search/items', labelKey: 'contracts.itemSearchTab' },
    { id: 'search/courier', labelKey: 'contracts.courierTab' },
  ],
  'history'
);

export const MARKET_TABS = definePageTabs('/market', [
  { id: 'browser', labelKey: 'market.sections.browser' },
  { id: 'orders', labelKey: 'market.sections.openOrders' },
  { id: 'stock', labelKey: 'market.sections.stock', deep: true },
  { id: 'history', labelKey: 'market.sections.history' },
  { id: 'appraisal', labelKey: 'market.sections.appraisal' },
  { id: 'hauling', labelKey: 'market.sections.hauling' },
]);

export const ASSETS_TABS = definePageTabs('/assets', [
  { id: 'items', labelKey: 'assets.tabs.items', deep: true },
  { id: 'ships', labelKey: 'assets.tabs.ships' },
  { id: 'move', labelKey: 'assets.tabs.move' },
]);

export const PAGE_TABS: Partial<Record<AppRoutePath, PageTabs>> = {
  '/corp/members': CORP_MEMBERS_TABS,
  '/corp/moons': MOONS_TABS,
  '/corp/srp': SRP_TABS,
  '/corp/vetting': VETTING_TABS,
  '/assets': ASSETS_TABS,
  '/contacts': CONTACTS_TABS,
  '/contracts': CONTRACTS_TABS,
  '/industry': INDUSTRY_TABS,
  '/ships': SHIPS_TABS,
  '/settings': SETTINGS_TABS,
  '/help': HELP_TABS,
  '/market': MARKET_TABS,
  '/planetary-industry': PI_TABS,
  '/mining': MINING_TABS,
  '/wallet': WALLET_TABS,
  '/travel': TRAVEL_TABS,
};

export const PAGE_LEGACY_LOCATIONS: Partial<
  Record<
    AppRoutePath,
    (pathname: string, search: string) => { pathname: string; search: string } | null
  >
> = {
  '/assets': legacyAssetsLocation,
  '/corp/members': legacyCorpMembersLocation,
  '/corp/moons': legacyMoonsLocation,
  '/market': legacyMarketLocation,
  '/travel': legacyTravelLocation,
  '/industry': legacyIndustryLocation,
};

function legacyTravelLocation(
  pathname: string,
  search: string
): { pathname: string; search: string } | null {
  if (pathname === '/travel/hauling' || pathname.startsWith('/travel/hauling/')) {
    return { pathname: tabPath(MARKET_TABS, 'hauling'), search };
  }
  if (pathname.replace(/\/$/, '') !== '/travel/thera') return null;
  const old = new URLSearchParams(search);
  const next = new URLSearchParams();
  const origin = old.get('origin');
  if (origin !== null) next.set('from', origin);
  const pref = old.get('pref');
  if (pref !== null) next.set('pref', pref);
  const query = next.toString();
  return { pathname: tabPath(TRAVEL_TABS, 'route'), search: query === '' ? '' : `?${query}` };
}

function legacyIndustryLocation(
  pathname: string,
  search: string
): { pathname: string; search: string } | null {
  return pathname === '/industry/records' || pathname === '/industry/records/'
    ? { pathname: tabPath(INDUSTRY_TABS, 'logs'), search }
    : null;
}

function legacyMarketLocation(
  pathname: string,
  search: string
): { pathname: string; search: string } | null {
  if (pathname === '/market/lp-store' || pathname.startsWith('/market/lp-store/')) {
    return { pathname: `/wallet${pathname.slice('/market'.length)}`, search };
  }
  if (pathname.replace(/\/$/, '') === '/market/history/transactions') {
    return { pathname: tabPath(MARKET_TABS, 'history'), search };
  }
  return null;
}

const TABBED_PAGES = Object.values(PAGE_TABS);

const NESTED_ROUTE_PATTERNS = (Object.keys(ROUTE_REQUIREMENTS) as AppRoutePath[]).filter((path) =>
  TABBED_PAGES.some((page) => path.startsWith(`${page.base}/`))
);

export function tabbedPageFor(pathname: string): PageTabs | null {
  if (NESTED_ROUTE_PATTERNS.some((pattern) => matchPath(pattern, pathname))) return null;
  return TABBED_PAGES.find((page) => isWithinPage(page, pathname)) ?? null;
}

export function routePatternFor(path: AppRoutePath): string {
  return PAGE_TABS[path] ? `${path}/*` : path;
}

export function pageKeyFor(pathname: string): string {
  if (pathname === '/corp/assets' || pathname.startsWith('/corp/assets/')) return '/corp/assets';
  const page = tabbedPageFor(pathname);
  if (page === null) return pathname;
  const id = tabFromPathname(page, pathname);
  const tab = page.tabs.find((candidate) => candidate.id === id);
  return tab?.standalone ? tabPath(page, tab.id) : page.base;
}

export function isTabRedirectPath(pathname: string): boolean {
  const page = tabbedPageFor(pathname);
  return page !== null && tabFromPathname(page, pathname) === null && !isIndexPath(page, pathname);
}

export function tabbedPagePathFor(pathname: string): string | null {
  const page = tabbedPageFor(pathname);
  if (page === null) return null;
  const tab = tabFromPathname(page, pathname);
  return tab === null ? page.base : tabPath(page, tab);
}
