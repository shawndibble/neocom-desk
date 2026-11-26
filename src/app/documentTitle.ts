import { matchPath } from 'react-router-dom';
import { tabFromPathname, tabPath } from '@/lib/pageTabs';
import { tabbedPageFor } from './pageTabs';
import type { AppRoutePath } from './routeScopes';

type Translate = (key: string) => string;

const SEPARATOR = ' — ';

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
  '/corp': ['nav.corpBoard'],
  '/corp/members': ['corp.members.title'],
  '/corp/wallet': ['corp.wallet.title'],
  '/corp/assets': ['nav.corpAssets'],
  '/corp/structures': ['nav.corpStructures'],
  '/corp/moons': ['corp.moons.title'],
  '/corp/srp': ['nav.corpSrp'],
  '/corp/vetting': ['nav.corpVetting'],
  '/vetting': ['vetting.request.title'],
  '/srp': ['nav.overview', 'nav.srp'],
  '/corp/assets/*': ['nav.corpAssets'],
  '/assets': ['assets.title'],
  '/mail': ['mail.title'],
  '/calendar': ['calendar.title'],
  '/contracts': ['contracts.title'],
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

const OTHER_ROUTE_TITLE_KEYS: Record<string, readonly string[]> = {
  '/': [],
  '/login': [],
  '/callback': [],
  '/error': ['error.title'],
  '/s/:shareId': ['share.title'],
  '/share/:shareId': ['share.title'],
  '/survey': ['survey.start.title'],
  '/communities/join/:code': ['communities.join.title'],
  '/corp-tax-book/verify/:token': ['corpTaxBook.verify.title'],
  '/corp-tax-book/remove-now/:code': ['corpTaxBook.removeNow.title'],
  '/apply/:corpId': ['vetting.apply.title'],
};

const ROUTE_PATTERNS = Object.entries({ ...OTHER_ROUTE_TITLE_KEYS, ...ROUTE_TITLE_KEYS });

function namesFor(pathname: string, t: Translate, hiddenTabPaths?: ReadonlySet<string>): string[] {
  const page = tabbedPageFor(pathname);
  if (page !== null) {
    const pageTitle = t(ROUTE_TITLE_KEYS[page.base as keyof typeof ROUTE_TITLE_KEYS][0]);
    const tabId = tabFromPathname(page, pathname);
    const tab = page.tabs.find((candidate) => candidate.id === tabId);
    if (tab && hiddenTabPaths?.has(tabPath(page, tab.id))) return [pageTitle];
    return tab ? [pageTitle, t(tab.labelKey)] : [pageTitle];
  }
  const match = ROUTE_PATTERNS.find(([pattern]) => matchPath(pattern, pathname));
  return (match ? match[1] : ['notFound.title']).map(t);
}

export function pageTitleFor(path: AppRoutePath, t: Translate): string {
  return t(ROUTE_TITLE_KEYS[path][0]);
}

export function documentTitleFor(
  pathname: string,
  t: Translate,
  hiddenTabPaths?: ReadonlySet<string>
): string {
  const names = namesFor(pathname, t, hiddenTabPaths);
  const distinct = names.filter((name, index) => names.indexOf(name) === index);
  return [...distinct.reverse(), t('app.name')].join(SEPARATOR);
}
