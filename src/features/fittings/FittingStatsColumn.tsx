import { useTranslation } from 'react-i18next';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import type { Fitting, FittingModuleResult } from '@/engine/fittings/types';
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
}

/**
 * The editor's stats column: `FittingStatsSections` fed from the workspace,
 * plus the Pilot and Situation panels' extras (tactical mode, implants,
 * missing skills).
 */
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
}: FittingStatsColumnProps) {
  const { t } = useTranslation();
  // What the stats column's Pilot and Situation panels hold beyond its own sections.
  const hasModes = tacticalModesFor(fitting.shipTypeId).length > 0;
  const showMissingSkills = gaps !== null && gaps.missing.length > 0 && characterId !== null;
  const showSkillsUnknown = gaps?.unknown === true && characterId !== null;
  const { edit, stats } = workspace;

  // Under Make it fit's provider too: the Fitting section's figures carry their "Fix" links.
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
        whatToTrain={
          <FittingWhatToTrainPanel
            evaluator={workspace.skillGains}
            characterId={characterId}
            fittingName={fitting.name}
            catalogue={catalogue}
          />
        }
        yourCharacters={yourCharacters.length > 1 ? yourCharacters : undefined}
        implants={
          <>
            <ImplantSetControl
              basis={workspace.implantBasis}
              canUseCloneBasis={workspace.canUseCloneBasis}
              implantSet={fitting.implantSet}
              onImplantSetChange={workspace.setImplantSet}
              fitting={fitting}
              profile={workspace.profile}
            />
            {workspace.implantBasis === 'clone' && workspace.canUseCloneBasis && (
              // Across both columns of the stats column's controls grid.
              <div className="col-span-2">
                <ImplantsAssumedNote hint={t('fittings.implants.assumesNoImplantsHint')} />
              </div>
            )}
          </>
        }
        abyssal={{
          hullGroupId: catalogue?.types[String(fitting.shipTypeId)]?.groupID,
          compare: workspace.compareWeather,
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
                notes:
                  showMissingSkills || showSkillsUnknown ? (
                    <>
                      {showMissingSkills && (
                        <MissingSkillsChip
                          entries={gaps.missing}
                          characterId={characterId}
                          fittingName={fitting.name}
                        />
                      )}
                      {showSkillsUnknown && <SkillsUnknownNote />}
                    </>
                  ) : undefined,
              }
        }
      />
    </MakeItFitContext.Provider>
  );
}
