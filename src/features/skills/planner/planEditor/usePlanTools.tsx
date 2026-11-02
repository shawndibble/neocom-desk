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

/**
 * The tools pane and the below-`lg` Skills to buy row. The sections are rebuilt each render
 * (never memoized): their content is plain elements, and the pane takes them as a prop.
 */
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
      // Round 17 called this section "Training" and gave it the two what-if
      // lenses. It is the character's *attributes* that those lenses move,
      // and attributes are the one piece of character state that explains
      // every number on this page — training time, projected finish, the
      // savings the remap optimizer quotes. So the section leads with the
      // sheet itself and keeps the lenses beneath it, which is why it is
      // named for the sheet now (and named the same as the plan list's
      // pane, which shows exactly this).
      //
      // Why here, and not a fourth panel: the sidebar already carries the
      // plan list plus this one tools panel, and the round-17 redesign
      // exists precisely because the page had grown too many peer panels.
      // Another one would cost another header strip to say the same thing,
      // and below `lg` — where there is no sidebar at all — it would land as
      // a second always-open block above the entry list, undoing the "the
      // whole tool set costs one collapsed row" rule. Inside the pane, the
      // attributes cost no rows on a phone and sit a line above the control
      // that reinterprets them on a desktop.
      //
      // The tradeoff that buys: below `lg` the attributes are behind the
      // same one tap as every other tool. Accepted deliberately — the plan
      // leads the page there, and a reference read is worth a tap where a
      // permanently-open block is not.
      id: 'attributes',
      title: t('plans.toolsAttributes'),
      // Dated like every other ESI-derived view, and in the same place the
      // plan list's Attributes panel dates it.
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
    // Skills to buy is an output, not a setting, so it sits right under the
    // attributes it is read beside rather than last. Below `lg` it is not in
    // this pane at all: the row in the main column puts it outside the
    // collapsed pane.
    ...(isDesktop
      ? [
          {
            id: 'skills-to-buy',
            title: t('plans.skillsToBuy.title'),
            content: skillsToBuy(false),
          },
        ]
      : []),
    // Alpha, the What-If Implants and the Booster change every number on the
    // page, and injectors are costed under Alpha, so they share one closed
    // row; its summary keeps whatever is set visible.
    {
      id: 'assumptions',
      title: t('plans.assumptions.title'),
      group: {
        summary: assumptionsSummary(
          {
            alpha: cloneState === 'alpha',
            whatIf,
            matchedJumpClone: matchedCloneId !== null,
            // What the scheduler applies, not every row: a prefilled accelerator
            // with no expiry yet is costed as none.
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
    // Several Characters only: a single-Character account has no one to rank.
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

  // One instance, placed on one side or the other — never both. The two
  // homes are genuinely different boxes in the layout (a sidebar column vs.
  // the single scrolling column), which no CSS reordering can bridge without
  // coupling the grid's row heights to each other.
  const toolsPane = <PlanToolsPane sections={toolSections} asDisclosure={!isDesktop} />;
  return { toolsPane, skillsToBuy };
}
