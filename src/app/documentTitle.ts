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
  '/skills/compare': ['nav.skills', 'skills.compareTab'],
  '/skills/ships': ['nav.skills', 'skills.shipsTab'],
  '/industry': ['nav.industry'],
  '/fittings': ['nav.fittings'],
  '/fittings/compare': ['nav.fittings', 'fittings.compare.title'],
  '/industry/plans/:planId': ['nav.industry', 'industry.buildPlansTab'],
  '/industry/groups/:groupId': ['nav.industry', 'industry.buildPlansTab'],
  '/market': ['nav.market'],
  '/wallet': ['nav.wallet'],
  '/wallet/loyalty/:corporationId': ['nav.wallet', 'loyaltyStore.title'],
  '/mining': ['nav.miningTax'],
  '/clones': ['clones.title'],
  '/planetary-industry': ['pi.title'],
  '/employment-history': ['employmentHistory.title'],
  '/corp': ['corp.title'],
  '/corp/members': ['corp.title', 'corp.members.title'],
  '/corp/assets': ['corp.title', 'corp.assets.title'],
  '/corp/assets/*': ['corp.title', 'corp.assets.title'],
  '/assets': ['assets.title'],
  '/assets/*': ['assets.title'],
  '/mail': ['mail.title'],
  '/calendar': ['calendar.title'],
  '/contracts': ['contracts.title'],
  // A redirect into Industry's BPC tab; titled only because every route must be.
  '/bpc-contracts': ['nav.industry'],
  '/contacts': ['contacts.title'],
  '/settings': ['settings.title'],
} satisfies Record<AppRoutePath, readonly string[]>;

/** Routes outside the Layout; an empty list titles as the app alone. */
const OTHER_ROUTE_TITLE_KEYS: Record<string, readonly string[]> = {
  '/': [],
  '/login': [],
  '/callback': [],
  '/styleguide': [],
  '/error': ['error.title'],
  '/share/appraisal': ['appraisalShare.title'],
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

export function documentTitleFor(pathname: string, t: Translate): string {
  const names = namesFor(pathname, t);
  // Market's Browser tab is labelled "Market"; say it once.
  const distinct = names.filter((name, index) => names.indexOf(name) === index);
  return [...distinct.reverse(), t('app.name')].join(SEPARATOR);
}
