import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Field, Fields, Tabs } from '@/components/ui';
import { PageSettingsButton } from '@/features/settings/PageSettingsModal';
import { LpValueSettingsForm } from '@/features/settings/LpValueSettingsForm';
import { HubField } from '@/features/market/HubMenu';
import { WALLET_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { usePriceBasis } from './priceBasis';

export function LpStoreActions() {
  const { t } = useTranslation();
  const priceBasis = usePriceBasis((s) => s.value);
  return (
    <PageSettingsButton pageName={t('loyaltyStore.title')} section="market">
      <div className="space-y-4">
        <Fields variant="form">
          <Field label={t('loyaltyStore.hubLabel')}>
            <HubField area="lpStore" side={priceBasis} label={t('loyaltyStore.hubLabel')} />
          </Field>
        </Fields>
        <LpValueSettingsForm />
      </div>
    </PageSettingsButton>
  );
}

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
