import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PageHeader, Panel, Tabs } from '@/components/ui';
import { GrantBanner } from '@/app/GrantNote';
import { PageSettingsButton } from '@/features/settings/PageSettingsModal';
import { IndustrySettingsForm } from '@/features/settings/IndustrySettingsForm';
import { BpcSourcingSettingsForm } from '@/features/settings/BpcSourcingSettingsForm';
import { ActiveJobsPanel } from './ActiveJobsPanel';
import { IndustryExplainerTrigger } from './IndustryExplainer';
import { useIsPhone } from '@/lib/useIsPhone';
import { IndustryCharacterPicker } from './IndustryCharacterPicker';
import { useHasProductionLogs } from './useHasProductionLogs';
import { INDUSTRY_TABS_ID, industryTabs, type IndustryTab } from './industryTabs';

export interface IndustryHeaderProps {
  activeCharacterId: number;
  activeTab: IndustryTab;
  onTabChange: (tab: IndustryTab) => void;
  blueprintsNeedsReauth: boolean;
  tabsActivation?: 'automatic' | 'manual';
  meta?: ReactNode;
  actions?: ReactNode;
}

function tabSettings(tab: IndustryTab, t: TFunction): ReactNode {
  switch (tab) {
    case 'plans':
      return (
        <PageSettingsButton key={tab} pageName={t('nav.industry')} section="industry">
          <IndustrySettingsForm />
        </PageSettingsButton>
      );
    case 'opportunities':
      return (
        <PageSettingsButton key={tab} pageName={t('industry.opportunitiesTab')} section="industry">
          <IndustrySettingsForm onlyAssumedMe />
        </PageSettingsButton>
      );
    case 'sourcing':
      return (
        <PageSettingsButton key={tab} pageName={t('industry.bpcSearchTab')} section="industry">
          <BpcSourcingSettingsForm />
        </PageSettingsButton>
      );
    case 'logs':
      return undefined;
  }
}

export function IndustryHeader({
  activeCharacterId,
  activeTab,
  onTabChange,
  blueprintsNeedsReauth,
  tabsActivation = 'automatic',
  meta,
  actions,
}: IndustryHeaderProps) {
  const { t } = useTranslation();
  const showLogs = useHasProductionLogs();
  const isPhone = useIsPhone();
  const tabs = industryTabs(t, { showLogs, activeTab });
  const onChange = (id: string) => onTabChange(id as IndustryTab);
  return (
    <>
      <PageHeader
        title={t('nav.industry')}
        meta={meta}
        scope={<IndustryCharacterPicker activeCharacterId={activeCharacterId} />}
        actions={
          <>
            {!(isPhone && actions) && <IndustryExplainerTrigger />}
            {actions}
            {tabSettings(activeTab, t)}
          </>
        }
      />
      <ActiveJobsPanel characterId={activeCharacterId} />

      {blueprintsNeedsReauth && (
        <Panel title={t('industry.blueprintsTitle')}>
          <GrantBanner characterId={activeCharacterId} endpoints={['getCharacterBlueprints']} />
        </Panel>
      )}

      <Tabs
        tabsId={INDUSTRY_TABS_ID}
        label={t('nav.industry')}
        value={activeTab}
        onChange={onChange}
        tabs={tabs}
        activation={tabsActivation}
      />
    </>
  );
}
