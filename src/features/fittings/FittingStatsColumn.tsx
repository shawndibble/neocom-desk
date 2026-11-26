import { useTranslation } from 'react-i18next';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import type { Fitting, FittingModuleResult } from '@/engine/fittings/types';
import type { FittingStatsDelta } from '@/engine/fittings/variationDelta';
import { tacticalModesFor } from '@/engine/fittings/tacticalModes';
import { FittingStatsSections } from './FittingStatsSections';
import { FittingWhatToTrainPanel } from './FittingWhatToTrainPanel';
import { ImplantSetControl } from './ImplantSetControl';
import { MissingSkillsChip } from './MissingSkillsChip';
import { SkillsUnknownNote } from './FittingPreviewPanels';
import { TacticalModePicker } from './TacticalModePicker';
import { MakeItFitContext, type FitResource } from './makeItFitContext';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import type { FittingSkillGaps } from './useFittingSkillGaps';
import type { FittingWorkspace } from './useFittingWorkspace';
import type { OverlayFitting } from './useOverlayFitting';
import type { TargetProfiles } from './targetProfiles';
import type { GapCharacter } from './useCharacterGaps';

interface FittingStatsColumnProps {
  workspace: FittingWorkspace;
  catalogue: FittingCatalogue | null;
  fitting: Fitting;
  moduleResults: FittingModuleResult[] | null;
  dronesShown: boolean;
  gaps: FittingSkillGaps | null;
  characterId: number | null;
  characterName: string | undefined;
  yourCharacters: readonly GapCharacter[];
  targetProfiles: TargetProfiles;
  overlay: OverlayFitting | undefined;
  onOpenMakeItFit: (resource: FitResource) => void;
  preview?: FittingStatsDelta | null;
  previewIsk?: number | null;
  ruleBreaks?: readonly string[];
  whatToTrainRequested?: boolean;
  onWhatToTrainShown?: () => void;
}

export function FittingStatsColumn({
  workspace,
  catalogue,
  fitting,
  moduleResults,
  dronesShown,
  gaps,
  characterId,
  characterName,
  yourCharacters,
  targetProfiles,
  overlay,
  onOpenMakeItFit,
  preview,
  previewIsk,
  ruleBreaks,
  whatToTrainRequested,
  onWhatToTrainShown,
}: FittingStatsColumnProps) {
  const { t } = useTranslation();
  const hasModes = tacticalModesFor(fitting.shipTypeId).length > 0;
  const showMissingSkills = gaps !== null && gaps.missing.length > 0 && characterId !== null;
  const showSkillsUnknown = gaps?.unknown === true && characterId !== null;
  const { edit, stats } = workspace;

  return (
    <MakeItFitContext.Provider value={onOpenMakeItFit}>
      <FittingStatsSections
        stats={stats}
        statsProgress={workspace.statsProgress}
        statsError={workspace.statsError}
        statsErrorReason={workspace.statsErrorReason}
        skillsKnown={workspace.skillsKnown}
        onRetry={workspace.retry}
        price={workspace.price}
        typeName={(typeId) => catalogueTypeName(catalogue, typeId)}
        damageProfiles={workspace.damageProfiles}
        targetProfiles={targetProfiles}
        overlay={overlay}
        showDrones={dronesShown}
        fitting={fitting}
        moduleResults={moduleResults}
        preview={preview}
        previewIsk={previewIsk}
        ruleBreaks={ruleBreaks}
        whatToTrainRequested={whatToTrainRequested}
        onWhatToTrainShown={onWhatToTrainShown}
        whatToTrain={
          <FittingWhatToTrainPanel
            evaluator={workspace.skillGains}
            characterId={characterId}
            fittingName={fitting.name}
            catalogue={catalogue}
            missingSkills={showMissingSkills ? gaps.missing : undefined}
          />
        }
        yourCharacters={yourCharacters.length > 1 ? yourCharacters : undefined}
        implants={
          <ImplantSetControl basis={workspace.implantBasis} implantSet={fitting.implantSet} />
        }
        implantsNote={
          workspace.implantBasis === 'clone' && workspace.canUseCloneBasis ? (
            <ImplantsAssumedNote hint={t('fittings.implants.assumesNoImplantsHint')} />
          ) : undefined
        }
        abyssal={{
          hullGroupId: catalogue?.types[String(fitting.shipTypeId)]?.groupID,
          compare: workspace.compareWeather,
          cargo: fitting.cargo,
        }}
        statsWeatherTypeId={workspace.statsWeatherTypeId}
        tacticalMode={
          hasModes ? <TacticalModePicker fitting={fitting} onChange={edit} /> : undefined
        }
        pilot={
          characterId === null
            ? undefined
            : {
                characterName: characterName ?? null,
                missingSkills: gaps?.missing.length,
                skillsUnknown: gaps?.unknown === true,
                notes: showSkillsUnknown ? <SkillsUnknownNote /> : undefined,
                missingSkillsChip: showMissingSkills ? (
                  <MissingSkillsChip
                    entries={gaps.missing}
                    characterId={characterId}
                    fittingName={fitting.name}
                  />
                ) : undefined,
              }
        }
      />
    </MakeItFitContext.Provider>
  );
}
