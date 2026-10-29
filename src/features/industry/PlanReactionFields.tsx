import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  InfoTooltip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { tappableRowClassName, touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import {
  FACILITY_PRESETS,
  resolveRigFit,
  setRigSlot,
  type FacilityKind,
} from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import { parseTaxPct } from './planInputParsers';
import { reactionBuildLocationPatch } from './buildLocationPatch';
import { BuildLocationPicker } from './BuildLocationPicker';
import { BuildSystemInput } from './BuildSystemInput';
import { SourcingInput } from './SourcingInput';
import { PlanRigFitField } from './PlanRigFitField';
import { REACTION_FACILITY_PRESETS } from './reactionFacilityDefaults';
import { clearedReactionBuildLocation, type PlanPatch } from './planPatch';

interface PlanReactionFieldsProps {
  plan: BuildPlanRecord;
  includeReactions: boolean;
  reactionBuildSystem: { id: number; name: string } | null;
  reactionBuildLocationName: string | null;
  reactionsInHighsec: boolean;
  update: (patch: PlanPatch) => void;
  toggleIncludeReactions: (include: boolean) => void;
}

/** Include Reactions and, when on, the Reaction Location's own picker, system, rigs and tax. Manufacturing plans only. */
export function PlanReactionFields({
  plan,
  includeReactions,
  reactionBuildSystem,
  reactionBuildLocationName,
  reactionsInHighsec,
  update,
  toggleIncludeReactions,
}: PlanReactionFieldsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <span className="flex items-center gap-2 text-xs">
        <label className={touchCheckboxLabelClassName}>
          <Checkbox
            id="build-plan-include-reactions"
            checked={includeReactions}
            onChange={(e) => toggleIncludeReactions(e.target.checked)}
          />
        </label>
        <label
          htmlFor="build-plan-include-reactions"
          className={`inline-flex items-center ${tappableRowClassName}`}
        >
          {t('industry.includeReactions')}
        </label>
        <InfoTooltip
          label={t('industry.includeReactionsTooltipLabel')}
          content={t('industry.includeReactionsTooltip')}
        />
      </span>

      {includeReactions && (
        <>
          <BuildLocationPicker
            activity="reaction"
            idPrefix="build-plan-reaction-location"
            labelKey="industry.reactionLocation"
            summary={t('industry.buildLocationSummary', {
              facility: FACILITY_PRESETS[plan.reactionFacility ?? 'athanor'].name,
              system: reactionBuildSystem?.name ?? t('industry.reactionLocationNotSet'),
              security: t(`industry.${plan.reactionSecurity ?? 'highsec'}`),
            })}
            selectedLabel={reactionBuildLocationName}
            onPick={(option) => update(reactionBuildLocationPatch(option))}
          >
            <label className="flex flex-col gap-1 text-xs">
              {t('industry.facility')}
              <Select
                value={plan.reactionFacility ?? 'athanor'}
                onValueChange={(value) =>
                  update({
                    reactionFacility: value as FacilityKind,
                    ...clearedReactionBuildLocation,
                  })
                }
              >
                <SelectTrigger aria-label={t('industry.facility')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Reaction-capable structures only — an
                                  engineering complex cannot host a reaction. */}
                  {REACTION_FACILITY_PRESETS.map((f) => (
                    <SelectItem key={f.kind} value={f.kind}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <BuildSystemInput
              idPrefix="build-plan-reaction-system"
              systemName={reactionBuildSystem?.name}
              hubSystemName={t('industry.reactionLocationNotSet')}
              securityLabel={t(`industry.${plan.reactionSecurity ?? 'highsec'}`)}
              onChange={(system) =>
                update({
                  reactionBuildSystemId: system?.id,
                  reactionBuildSystemName: system?.name,
                  ...clearedReactionBuildLocation,
                  ...(system === null
                    ? { reactionSecurity: 'highsec' }
                    : system.security !== null
                      ? { reactionSecurity: system.security }
                      : {}),
                })
              }
            />
          </BuildLocationPicker>
          {reactionsInHighsec && (
            <p className="text-xs text-warning">{t('industry.reactionBlocked.setupRule')}</p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <PlanRigFitField
              fit={resolveRigFit({ rigFit: plan.reactionRigFit })}
              facility={plan.reactionFacility ?? 'athanor'}
              security={plan.reactionSecurity ?? 'highsec'}
              onSlotChange={(slot, kind) =>
                update({
                  reactionRigFit: setRigSlot(
                    resolveRigFit({ rigFit: plan.reactionRigFit }),
                    slot,
                    kind
                  ),
                })
              }
              onApplyFit={(fit) => update({ reactionRigFit: fit })}
            />

            <div className="flex flex-col gap-1 text-xs">
              <span className="flex items-center gap-1">
                <label htmlFor="build-plan-reaction-facility-tax">
                  {t('industry.facilityTax')}
                </label>
                <InfoTooltip
                  label={t('industry.facilityTaxTooltipLabel')}
                  content={t('industry.facilityTaxTooltip')}
                />
              </span>
              <SourcingInput
                id="build-plan-reaction-facility-tax"
                value={plan.reactionFacilityTaxPct ?? 0}
                label={t('industry.facilityTax')}
                inputMode="decimal"
                widthClassName="w-full"
                parse={(raw) => parseTaxPct(plan.reactionFacilityTaxPct ?? 0, raw)}
                onCommit={(reactionFacilityTaxPct) => update({ reactionFacilityTaxPct })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
