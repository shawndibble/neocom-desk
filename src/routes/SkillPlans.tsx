import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { PageHeader, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { isSyncConfigured } from '@/app/syncStatus';
import { useSyncStatus } from '@/app/useSyncStatus';
import { SyncErrorNote } from '@/app/SyncErrorNote';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { AttributesPane } from '@/features/skills/planner/AttributesPane';
import { CurrentQueuePanel } from '@/features/skills/planner/CurrentQueuePanel';
import { PlanListPane } from '@/features/skills/planner/PlanListPane';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { useIsDesktop } from '@/lib/useIsDesktop';

/**
 * Skill Plan list — where the Skills section opens (`/skills` redirects here).
 * On wide screens the pane beside it holds the character's current attributes
 * until a plan is opened, at which point the editor takes it over from its own
 * route (#158).
 */
export function SkillPlans() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const syncStatus = useSyncStatus();
  const { catalog, attributesResult, implants, remapInfo } = usePlanEditorData(activeCharacterId);
  const isDesktop = useIsDesktop();

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={t('nav.skills')} />
      <SkillsSubNav />
      {isSyncConfigured() && <SyncErrorNote {...syncStatus} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
        <PlanListPane activeCharacterId={activeCharacterId} remapInfo={remapInfo} />
        {/* Desktop-only, like the placeholder it replaces: below `lg` the
            list owns the single column, and the editor takes it once a plan
            is open. */}
        <AttributesPane
          result={attributesResult}
          implantBonuses={implants}
          remapInfo={remapInfo}
          className={isDesktop ? '' : 'hidden'}
        />
      </div>

      {catalog && <CurrentQueuePanel characterId={activeCharacterId} catalog={catalog} />}
    </div>
  );
}
