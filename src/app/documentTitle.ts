/**
 * The browser tab's title for a pathname: most specific name first, then the
 * app — `Open — Market — Neocom Desk` — so a crowded tab strip and a screen
 * reader's window list both tell pages apart (WCAG 2.4.2). A tabbed page adds
 * its tab's label; a nested route adds its section's.
 */
import { matchPath } from 'react-router-dom';
import { tabFromPathname } from '@/lib/pageTabs';
import { tabbedPageFor } from './pageTabs';
import type { AppRoutePath } from './routeScopes';

type Translate = (key: string) => string;

const SEPARATOR = ' — ';

/**
 * i18n keys per feature route, page first then section. `satisfies Record`
 * makes a new route without a title a compile error, as `ROUTE_ELEMENTS` does
 * for its scope declaration.
 */
const ROUTE_TITLE_KEYS = {
  '/characters': ['characters.title'],
  '/overview': ['nav.overview'],
  '/alerts': ['nav.alerts'],
  '/skills': ['nav.skills'],
  '/skills/trained': ['nav.skills', 'skills.trainedTab'],
  '/skills/plans': ['nav.skills', 'skills.plansTab'],
  '/skills/plans/:planId': ['nav.skills', 'skills.plansTab'],
  '/skills/compare': ['nav.skills', 'skills.trainedTab'],
  '/skills/certificates': ['nav.skills', 'skills.certificatesTab'],
  '/industry': ['nav.industry'],
  '/ships': ['nav.ships'],
  '/ships/fittings/compare': ['nav.ships', 'fittings.compare.title'],
  '/industry/plans/:planId': ['nav.industry', 'industry.buildPlansTab'],
  '/industry/groups/:groupId': ['nav.industry', 'industry.buildPlansTab'],
  '/market': ['nav.market'],
  '/wallet': ['nav.wallet'],
  '/wallet/lp-store': ['nav.wallet', 'loyalty.browseStores'],
  '/wallet/lp-store/:corporationId': ['nav.wallet', 'loyaltyStore.title'],
  '/wallet/loyalty': ['nav.wallet', 'loyalty.browseStores'],
  '/wallet/loyalty/:corporationId': ['nav.wallet', 'loyaltyStore.title'],
  '/mining': ['nav.miningTax'],
  '/clones': ['clones.title'],
  '/planetary-industry': ['pi.title'],
  '/planetary-industry/advisor': ['pi.title'],
  '/employment-history': ['employmentHistory.title'],
  // Each Corp page is named on its own, with no "Corporation" prefix.
  '/corp': ['corp.boardPageTitle'],
  // A tabbed page (pageTabs.ts): its title leads, the tab follows it.
  '/corp/members': ['corp.members.title'],
  '/corp/wallet': ['corp.wallet.title'],
  '/corp/assets': ['corp.assets.title'],
  '/corp/moons': ['corp.moons.title'],
  '/corp/assets/*': ['corp.assets.title'],
  '/assets': ['assets.title'],
  '/mail': ['mail.title'],
  '/calendar': ['calendar.title'],
  '/contracts': ['contracts.title'],
  // A redirect into Industry's BPC tab; titled only because every route must be.
  '/bpc-contracts': ['nav.industry'],
  '/communities': ['communities.title'],
  '/contacts': ['contacts.title'],
  '/travel': ['travel.title'],
  '/pilot-lookup': ['nav.pilotLookup'],
  '/settings': ['settings.title'],
  '/settings/shortcuts': ['nav.help'],
  '/settings/faq': ['nav.help'],
  '/settings/help': ['nav.help'],
  '/help': ['nav.help'],
} satisfies Record<AppRoutePath, readonly string[]>;

/** Routes outside the Layout; an empty list titles as the app alone. */
const OTHER_ROUTE_TITLE_KEYS: Record<string, readonly string[]> = {
  '/': [],
  '/login': [],
  '/callback': [],
  '/error': ['error.title'],
  '/s/:shareId': ['share.title'],
  '/share/:shareId': ['share.title'],
  '/communities/join/:code': ['communities.join.title'],
  '/corp-tax-book/verify/:token': ['corpTaxBook.verify.title'],
  '/corp-tax-book/remove-now/:code': ['corpTaxBook.removeNow.title'],
};

const ROUTE_PATTERNS = Object.entries({ ...OTHER_ROUTE_TITLE_KEYS, ...ROUTE_TITLE_KEYS });

function namesFor(pathname: string, t: Translate): string[] {
  const page = tabbedPageFor(pathname);
  if (page !== null) {
    const pageTitle = t(ROUTE_TITLE_KEYS[page.base as keyof typeof ROUTE_TITLE_KEYS][0]);
    const tabId = tabFromPathname(page, pathname);
    const tab = page.tabs.find((candidate) => candidate.id === tabId);
    return tab ? [pageTitle, t(tab.labelKey)] : [pageTitle];
  }
  const match = ROUTE_PATTERNS.find(([pattern]) => matchPath(pattern, pathname));
  return (match ? match[1] : ['notFound.title']).map(t);
}

/** A feature route's page name alone (no tab, no app name) — the h1 a locked page still needs. */
export function pageTitleFor(path: AppRoutePath, t: Translate): string {
  return t(ROUTE_TITLE_KEYS[path][0]);
}

export function documentTitleFor(pathname: string, t: Translate): string {
  const names = namesFor(pathname, t);
  // Market's Browser tab is labelled "Market"; say it once.
  const distinct = names.filter((name, index) => names.indexOf(name) === index);
  return [...distinct.reverse(), t('app.name')].join(SEPARATOR);
}
