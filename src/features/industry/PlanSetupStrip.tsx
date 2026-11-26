import { useTranslation } from 'react-i18next';
import { textActionClassName } from '@/components/ui/textActionClassName';
import type { BuildPlanRecord } from '@/db';
import type { FacilityKind, IndustryActivity } from '@/engine/industry/types';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { TradeHub } from '@/market/hubs';
import { PlanSetupFacts } from './PlanSetupFacts';

interface PlanSetupStripProps {
  open: boolean;
  formId: string;
  onToggle: () => void;
  plan: BuildPlanRecord;
  activity: IndustryActivity;
  hub: TradeHub;
  facilityPreset: (typeof FACILITY_PRESETS)[FacilityKind];
  buildSystemName: string | null;
  buildLocationName: string | null;
  includeReactions: boolean;
  reactionBuildSystemName: string | null;
  reactionBuildLocationName: string | null;
  reactionsInHighsec: boolean;
  resolvedMe: number;
  resolvedTe: number;
  lacksBlueprintRow: boolean;
}

export function PlanSetupStrip({
  open,
  formId,
  onToggle,
  plan,
  activity,
  hub,
  facilityPreset,
  buildSystemName,
  buildLocationName,
  includeReactions,
  reactionBuildSystemName,
  reactionBuildLocationName,
  reactionsInHighsec,
  resolvedMe,
  resolvedTe,
  lacksBlueprintRow,
}: PlanSetupStripProps) {
  const { t } = useTranslation();
  return (
    <>
      {!open && (
        <PlanSetupFacts
          plan={plan}
          activity={activity}
          hub={hub}
          facilityPreset={facilityPreset}
          buildSystemName={buildSystemName}
          buildLocationName={buildLocationName}
          includeReactions={includeReactions}
          reactionBuildSystemName={reactionBuildSystemName}
          reactionBuildLocationName={reactionBuildLocationName}
          reactionsInHighsec={reactionsInHighsec}
          resolvedMe={resolvedMe}
          resolvedTe={resolvedTe}
          lacksBlueprintRow={lacksBlueprintRow}
        />
      )}
      <button
        type="button"
        className={textActionClassName('ml-auto shrink-0')}
        aria-expanded={open}
        aria-controls={formId}
        onClick={onToggle}
      >
        {open ? t('industry.setupDone') : t('industry.setupEdit')}
      </button>
    </>
  );
}
