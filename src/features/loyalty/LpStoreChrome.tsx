import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Field, Fields, Tabs } from '@/components/ui';
import { PageSettingsButton } from '@/features/settings/PageSettingsModal';
import { LpValueSettingsForm } from '@/features/settings/LpValueSettingsForm';
import { TradeHubSelect } from '@/features/loyalty/TradeHubSelect';
import { useMarketHub } from '@/features/market/hub';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { WALLET_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';

/**
 * The header's gear for the two settings this page's numbers lean on: LP
 * Value and the Trade hub. The hub is the app-wide one (`useMarketHub`) the
 * filter row's select writes too, so the two never disagree.
 */
export function LpStoreActions() {
  const { t } = useTranslation();
  const hubId = useMarketHub((s) => s.value);
  const setHubId = useMarketHub((s) => s.setValue);
  useHydratedStore(useMarketHub);
  return (
    <PageSettingsButton pageName={t('loyaltyStore.title')} section="market">
      <div className="space-y-4">
        <Fields variant="form">
          <Field label={t('loyaltyStore.hubLabel')} htmlFor="lp-store-gear-hub">
            <TradeHubSelect
              id="lp-store-gear-hub"
              value={hubId}
              onValueChange={(id) => void setHubId(id)}
            />
          </Field>
        </Fields>
        <LpValueSettingsForm />
      </div>
    </PageSettingsButton>
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
