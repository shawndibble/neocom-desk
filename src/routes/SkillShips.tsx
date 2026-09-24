import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { PageHeader, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { useTargetPlan } from '@/features/skills/useTargetPlan';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { ShipsPanel } from '@/features/skills/ships/ShipsPanel';

/**
 * "What skills for this ship" — one flat list merging Mastery tiers with an
 * optional attached fit, tagged by source. "What skill affects this module"
 * lives inline on Market's item detail instead — a lookup, not a destination.
 */
export function SkillShips() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const { catalog, trainedSkills, attributes, implants } = usePlanEditorData(activeCharacterId);
  const target = useTargetPlan(activeCharacterId);
  const cloneStates = useCloneStates((state) => state.value);
  const hydrateCloneStates = useCloneStates((state) => state.hydrate);
  useEffect(() => {
    void hydrateCloneStates();
  }, [hydrateCloneStates]);

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={t('nav.skills')} />
      <SkillsSubNav />

      {!catalog ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : (
        <ShipsPanel
          target={target}
          skills={catalog.engineSkills}
          trainedSkills={trainedSkills}
          attributes={attributes}
          implants={implants}
          cloneState={cloneStateFor(cloneStates, activeCharacterId)}
        />
      )}
    </div>
  );
}
