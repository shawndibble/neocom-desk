import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { EmptyState, PageHeader, Spinner, Tabs, type TabItem } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { useTargetPlan } from '@/features/skills/useTargetPlan';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { FitCheckPanel } from '@/features/skills/ships/FitCheckPanel';

type ShipsMode = 'fitCheck' | 'mastery';

/**
 * "What skills for this fit / this ship's mastery" — the two "I have a
 * ship/fit in mind" planning activities, segmented alongside Skills'
 * Plans/Trained/Compare. "What skill affects this module" lives inline on
 * Market's item detail instead — a lookup, not a destination.
 */
export function SkillShips() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ShipsMode>('fitCheck');
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

  const modeTabs: TabItem[] = [
    { id: 'fitCheck', label: t('skills.ships.fitCheckTab') },
    { id: 'mastery', label: t('skills.ships.masteryTab') },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={t('nav.skills')} />
      <SkillsSubNav />

      <Tabs
        tabs={modeTabs}
        value={mode}
        onChange={(id) => setMode(id as ShipsMode)}
        label={t('skills.ships.tabsLabel')}
      />

      {!catalog ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : mode === 'fitCheck' ? (
        <FitCheckPanel
          target={target}
          skills={catalog.engineSkills}
          trainedSkills={trainedSkills}
          attributes={attributes}
          implants={implants}
          cloneState={cloneStateFor(cloneStates, activeCharacterId)}
        />
      ) : (
        <EmptyState
          title={t('skills.ships.masteryComingSoonTitle')}
          hint={t('skills.ships.masteryComingSoonHint')}
        />
      )}
    </div>
  );
}
