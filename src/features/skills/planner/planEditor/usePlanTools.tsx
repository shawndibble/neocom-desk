import { DataAgeBadge } from '@/components/ui';
import { useTranslation } from 'react-i18next';
import type { SkillPlanRecord } from '@/db';
import type { AttributeBaseline } from '@/engine/attributeBaseline';
import type { Implants, TrainedSkill } from '@/engine/types';
import type { CharacterAttributes } from '@/esi/endpoints';
import { useCharacters } from '@/features/character/useCharacters';
import type { CachedResult } from '../../data';
import type { SkillCatalog } from '../../skillMap';
import { assumptionsSummary } from '../assumptionsSummary';
import { InjectorFactsPanel } from '../InjectorFactsPanel';
import { PlanToolsPane, type PlanToolSection } from '../PlanToolsPane';
import { SkillsToBuyPanel } from '../SkillsToBuyPanel';
import type { OptimizeVerdict } from '../optimizeVerdict';
import type { RemapAvailability } from '../remapAvailability';
import { CLOSEST_AUTO_LOAD_MAX, WhoIsClosest } from '../WhoIsClosest';
import { ActionsToolSection } from './ActionsToolSection';
import { AssumptionControls } from './AssumptionControls';
import { AttributesToolSection } from './AttributesToolSection';
import type { usePlanAssumptions } from './usePlanAssumptions';
import type { usePlanOptimize } from './usePlanOptimize';
import type { PlanScheduleResult } from './usePlanSchedule';
import type { usePlanToolActions } from './usePlanToolActions';

export function usePlanTools({
  characterId,
  plan,
  catalog,
  trainedSkills,
  trainedSkillsKnown,
  nameFor,
  remapInfo,
  attributesResult,
  attributeBaseline,
  implants,
  totalSp,
  unallocatedSp,
  isDesktop,
  schedule,
  assumptions,
  optimize,
  toolActions,
  markersVerdict,
  onAddFitGoal,
}: {
  characterId: number;
  plan: SkillPlanRecord;
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  trainedSkillsKnown: boolean;
  nameFor: (skillTypeID: number) => string;
  remapInfo: RemapAvailability | null;
  attributesResult: CachedResult<CharacterAttributes> | null;
  attributeBaseline: AttributeBaseline | null;
  implants: Implants;
  totalSp: number | null;
  unallocatedSp: number | null;
  isDesktop: boolean;
  schedule: PlanScheduleResult;
  assumptions: ReturnType<typeof usePlanAssumptions>;
  optimize: ReturnType<typeof usePlanOptimize>;
  toolActions: ReturnType<typeof usePlanToolActions>;
  markersVerdict: OptimizeVerdict | null;
  onAddFitGoal: () => void;
}) {
  const { t } = useTranslation();
  const roster = useCharacters();
  const { scheduled, alphaCappedSteps } = schedule;
  const { cloneState, whatIf, matchedCloneId, activeBoosters } = assumptions;
  const skillsToBuy = (collapsible: boolean) => (
    <SkillsToBuyPanel
      entries={plan.entries}
      trainedSkills={trainedSkills}
      trainedSkillsKnown={trainedSkillsKnown}
      nameFor={nameFor}
      collapsible={collapsible}
    />
  );
  const toolSections: PlanToolSection[] = [
    {
      id: 'actions',
      title: t('plans.toolsActions'),
      content: (
        <ActionsToolSection
          remapInfo={remapInfo}
          remapCount={plan.remapCount}
          markers={plan.markers}
          scheduledCount={scheduled.length}
          optimize={optimize}
          toolActions={toolActions}
          markersVerdict={markersVerdict}
          trainedSkillsKnown={trainedSkillsKnown}
          onAddFitGoal={onAddFitGoal}
        />
      ),
    },
    {
      id: 'attributes',
      title: t('plans.toolsAttributes'),
      actions: attributesResult?.fetchedAt && (
        <DataAgeBadge date={attributesResult.fetchedAt} expiresAt={attributesResult.expiresAt} />
      ),
      content: (
        <AttributesToolSection
          attributesResult={attributesResult}
          implants={implants}
          attributeBaseline={attributeBaseline}
        />
      ),
    },
    ...(isDesktop
      ? [
          {
            id: 'skills-to-buy',
            title: t('plans.skillsToBuy.title'),
            content: skillsToBuy(false),
          },
        ]
      : []),
    {
      id: 'assumptions',
      title: t('plans.assumptions.title'),
      group: {
        summary: assumptionsSummary(
          {
            alpha: cloneState === 'alpha',
            whatIf,
            matchedJumpClone: matchedCloneId !== null,
            boosterCount: activeBoosters.length,
          },
          t
        ),
        sections: [
          {
            id: 'assumption-controls',
            title: t('plans.assumptions.title'),
            hideTitle: true,
            content: (
              <AssumptionControls
                assumptions={assumptions}
                alphaCappedCount={alphaCappedSteps.size}
                implants={implants}
              />
            ),
          },
          {
            id: 'injectors',
            title: t('plans.injectors.title'),
            content: (
              <InjectorFactsPanel
                scheduled={scheduled}
                totalSp={totalSp}
                unallocatedSp={unallocatedSp}
                cloneState={cloneState}
              />
            ),
          },
        ],
      },
    },
    ...(roster.length > 1
      ? [
          {
            id: 'closest',
            title: t('plans.closest.title'),
            hideTitle: roster.length > CLOSEST_AUTO_LOAD_MAX,
            content: (
              <WhoIsClosest
                roster={roster}
                ownerId={characterId}
                entries={plan.entries}
                skills={catalog.engineSkills}
              />
            ),
          },
        ]
      : []),
  ];

  const toolsPane = <PlanToolsPane sections={toolSections} asDisclosure={!isDesktop} />;
  return { toolsPane, skillsToBuy };
}
