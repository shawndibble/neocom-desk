import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui';
import { PageSettingsButton } from '@/features/settings/PageSettingsModal';
import { LpValueSettingsForm } from '@/features/settings/LpValueSettingsForm';
import type { LpSearchCrumbState } from '@/features/loyalty/itemSearch';
import { WALLET_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';

/** The header's gear for the one setting this page's numbers lean on, LP Value. */
export function LpStoreActions() {
  const { t } = useTranslation();
  return (
    <>
      <PageSettingsButton pageName={t('loyaltyStore.title')} section="market">
        <LpValueSettingsForm />
      </PageSettingsButton>
    </>
  );
}

/**
 * LP Store is a Wallet tab, but its own route outranks Wallet's, so the page
 * draws Wallet's tab bar itself. Every other tab is a path under `/wallet`;
 * `transactions` is no tab Wallet shows (it redirects to Market).
 */
export function WalletTabBar({ tabsId }: { tabsId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Tabs
      tabsId={tabsId}
      label={t('wallet.title')}
      value="lp-store"
      onChange={(id) =>
        navigate(tabPath(WALLET_TABS, id as (typeof WALLET_TABS.tabs)[number]['id']))
      }
      tabs={WALLET_TABS.tabs
        .filter((tab) => tab.id !== 'transactions')
        .map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
    />
  );
}

const CRUMB_CLASS =
  'inline-flex min-h-11 items-center gap-1 rounded-xs px-2 text-xs text-text-dim hover:text-text active:text-text-dim md:min-h-0';

/**
 * The links above an open store: back to the search it was opened from (a
 * result row carries the query in the location state), and "Change store" to
 * the landing search, the way to switch stores.
 */
export function StoreCrumbs() {
  const { t } = useTranslation();
  const state = useLocation().state as Partial<LpSearchCrumbState> | null;
  // An empty query is the landing itself, which "Change store" already links to.
  const q = state?.from === 'lp-search' && state.q ? state.q : null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 self-start">
      {q !== null && (
        <Link to={`/wallet/lp-store?q=${encodeURIComponent(q)}`} className={CRUMB_CLASS}>
          <span aria-hidden="true">‹</span>
          {t('loyaltyStore.search.crumb')}
        </Link>
      )}
      <Link to="/wallet/lp-store" className={CRUMB_CLASS}>
        <span aria-hidden="true">‹</span>
        {t('loyaltyStore.search.changeStore')}
      </Link>
    </div>
  );
}
