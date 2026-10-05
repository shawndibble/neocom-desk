import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PageHeader, Panel, Tabs } from '@/components/ui';
import { GrantBanner } from '@/app/GrantNote';
import { PageSettingsButton } from '@/features/settings/PageSettingsModal';
import { IndustrySettingsForm } from '@/features/settings/IndustrySettingsForm';
import { BpcSourcingSettingsForm } from '@/features/settings/BpcSourcingSettingsForm';
import { ActiveJobsPanel } from './ActiveJobsPanel';
import { industryTabs, type IndustryTab } from './industryTabs';

export interface IndustryHeaderProps {
  activeCharacterId: number;
  activeTab: IndustryTab;
  onTabChange: (tab: IndustryTab) => void;
  blueprintsNeedsReauth: boolean;
  /**
   * `'manual'` for `IndustryPlanPage`/`IndustryGroupPage`, whose `onTabChange`
   * navigates away rather than swapping content in place — see `Tabs`'
   * `activation` doc. Defaults to `'automatic'`, matching `Industry.tsx`'s own
   * in-page tab switch, which arrow keys already handle correctly.
   */
  tabsActivation?: 'automatic' | 'manual';
  /** Beside the page title — the current tab's `DataAgeBadge`, when it has one. */
  meta?: ReactNode;
}

/**
 * The gear for the settings this tab reads, or none when it reads none.
 * Keyed by tab so an open modal never carries over to the next tab's form.
 */
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
    case 'records':
      return undefined;
  }
}

/**
 * The chrome every Industry page shares above its own content: title (and
 * the current tab's settings gear beside it), Active Jobs, the reauth
 * banner, and the 4-tab strip — identical whether this is the index or a
 * plan/group's own full-width page, so moving
 * between them reads as "only the content under the tabs changed," not a
 * jump to a different page. `Industry.tsx`'s tab switch keeps this mounted
 * while it swaps content underneath; `IndustryPlanPage`/`IndustryGroupPage`
 * render it with `activeTab="plans"` and navigate on any other tab pick.
 */
export function IndustryHeader({
  activeCharacterId,
  activeTab,
  onTabChange,
  blueprintsNeedsReauth,
  tabsActivation = 'automatic',
  meta,
}: IndustryHeaderProps) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('nav.industry')} meta={meta} actions={tabSettings(activeTab, t)} />
      <ActiveJobsPanel characterId={activeCharacterId} />

      {blueprintsNeedsReauth && (
        <Panel title={t('industry.blueprintsTitle')}>
          <GrantBanner
            characterId={activeCharacterId}
            endpoints={['getCharacterBlueprints']}
            title={t('industry.blueprintsReauthTitle')}
            hint={t('industry.blueprintsReauthHint')}
            actionLabel={t('industry.blueprintsReauthAction')}
          />
        </Panel>
      )}

      <Tabs
        label={t('nav.industry')}
        value={activeTab}
        onChange={(id) => onTabChange(id as IndustryTab)}
        tabs={industryTabs(t)}
        activation={tabsActivation}
      />
    </>
  );
}
