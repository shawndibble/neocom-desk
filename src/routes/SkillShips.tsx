import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { EmptyState, PageHeader, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { SkillsSubNav } from '@/features/skills/SkillsSubNav';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { useTargetPlan } from '@/features/skills/useTargetPlan';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { FitCheckPanel } from '@/features/skills/ships/FitCheckPanel';

type ShipsMode = 'fitCheck' | 'mastery';

/**
 * Ships tab (issue #1366): "what skills do I need to fly this fit / hit this
 * ship's mastery level" — the two "I have a ship/fit in mind" planning
 * activities, as a segmented sub-view of Skills alongside Plans/Trained/
 * Compare. "What skill affects this module" (the third original question)
 * is deliberately not here — it's an inline chip on the item itself
 * (Market's item detail), not a destination.
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

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={t('nav.skills')} />
      <SkillsSubNav />

      <div className="flex gap-1 border-b border-line">
        <SegmentButton active={mode === 'fitCheck'} onClick={() => setMode('fitCheck')}>
          {t('skills.ships.fitCheckTab')}
        </SegmentButton>
        <SegmentButton active={mode === 'mastery'} onClick={() => setMode('mastery')}>
          {t('skills.ships.masteryTab')}
        </SegmentButton>
      </div>

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

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'border-b-2 border-accent px-3 py-1.5 text-xs font-semibold tracking-widest text-text uppercase'
          : 'border-b-2 border-transparent px-3 py-1.5 text-xs font-semibold tracking-widest text-text-dim uppercase'
      }
    >
      {children}
    </button>
  );
}
