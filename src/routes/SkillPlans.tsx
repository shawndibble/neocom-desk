import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { EmptyState, PageHeader, Panel, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { isSyncConfigured } from '@/app/syncStatus';
import { useSyncStatus } from '@/app/useSyncStatus';
import { SyncErrorNote } from '@/app/SyncErrorNote';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { CurrentQueuePanel } from '@/features/skills/planner/CurrentQueuePanel';
import { PlanListPane } from '@/features/skills/planner/PlanListPane';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { useIsDesktop } from '@/lib/useIsDesktop';

/** Skill Plan list, beside the open plan's editor on wide screens (#158); editing a plan happens on its own route. */
export function SkillPlans() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const syncStatus = useSyncStatus();
  const { catalog, remapInfo } = usePlanEditorData(activeCharacterId);
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

      {/* `lg:items-start`: grid items stretch to the row's height by
          default, so without this a short right column gets pulled down to
          match a taller plan list, or vice versa. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr] lg:items-start">
        <PlanListPane activeCharacterId={activeCharacterId} remapInfo={remapInfo} />
        <Panel className={isDesktop ? '' : 'hidden'}>
          <EmptyState title={t('plans.selectHint')} className="py-8" />
        </Panel>
      </div>

      {catalog && <CurrentQueuePanel characterId={activeCharacterId} catalog={catalog} />}
    </div>
  );
}
