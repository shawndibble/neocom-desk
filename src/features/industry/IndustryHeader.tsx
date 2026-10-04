import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, Panel, Tabs } from '@/components/ui';
import { GrantBanner } from '@/app/GrantNote';
import { PageSettingsButton } from '@/features/settings/PageSettingsModal';
import { IndustrySettingsForm } from '@/features/settings/IndustrySettingsForm';
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
 * The chrome every Industry page shares above its own content: title (and
 * the page settings gear beside it),
 * Active Jobs, the reauth banner, and the 4-tab strip — identical whether
 * this is the index or a plan/group's own full-width page, so moving
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
      <PageHeader
        title={t('nav.industry')}
        meta={meta}
        actions={
          <PageSettingsButton pageName={t('nav.industry')} section="industry">
            <IndustrySettingsForm />
          </PageSettingsButton>
        }
      />
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
