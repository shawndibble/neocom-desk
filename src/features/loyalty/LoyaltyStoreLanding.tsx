import { useTranslation } from 'react-i18next';
import { PageHeader, TabPanel, useTabsId } from '@/components/ui';
import { LpStoreSearch } from '@/features/loyalty/LpStoreSearch';
import { LpStoreActions, WalletTabBar } from '@/features/loyalty/LpStoreChrome';
import { useUrlParams } from '@/lib/useUrlState';
import { textParam } from '@/lib/urlState';

/** `/wallet/lp-store` with no corporation chosen yet: the item-first search. */
export function LoyaltyStoreLanding() {
  const { t } = useTranslation();
  const [params, setParams] = useUrlParams(LANDING_PARAMS);
  const tabsId = useTabsId();
  return (
    <div className="mx-auto flex max-w-page flex-col gap-3">
      <PageHeader title={t('loyaltyStore.title')} actions={<LpStoreActions />} />
      <WalletTabBar tabsId={tabsId} />
      <TabPanel tabsId={tabsId} tabId="lp-store">
        <LpStoreSearch query={params.q} onQueryChange={(q) => setParams({ q })} />
      </TabPanel>
    </div>
  );
}

/** The search box's text, in the URL (ADR 0015) so a search can be linked and Back returns to it. */
const LANDING_PARAMS = { q: textParam() };
