import { useTranslation } from 'react-i18next';
import { PageHeader, Panel, ReauthBanner, Tabs } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { ActiveJobsPanel } from './ActiveJobsPanel';
import { industryTabs, type IndustryTab } from './industryTabs';

export interface IndustryHeaderProps {
  activeCharacterId: number;
  activeTab: IndustryTab;
  onTabChange: (tab: IndustryTab) => void;
  blueprintsNeedsReauth: boolean;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
}

/**
 * The chrome every Industry page shares above its own content: title,
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
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
}: IndustryHeaderProps) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('nav.industry')} />
      <ActiveJobsPanel
        characterId={activeCharacterId}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable={quickbarAvailable}
        onShowInfo={onShowInfo}
      />

      {blueprintsNeedsReauth && (
        <Panel title={t('industry.blueprintsTitle')}>
          <ReauthBanner
            title={t('industry.blueprintsReauthTitle')}
            hint={t('industry.blueprintsReauthHint')}
            actionLabel={t('industry.blueprintsReauthAction')}
            onLogin={() => void beginEveLogin()}
          />
        </Panel>
      )}

      <Tabs
        label={t('nav.industry')}
        value={activeTab}
        onChange={(id) => onTabChange(id as IndustryTab)}
        tabs={industryTabs(t)}
      />
    </>
  );
}
