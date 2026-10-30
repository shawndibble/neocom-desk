import { useTranslation } from 'react-i18next';
import {
  InfoTooltip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import {
  EMPTY_RIG_FIT,
  FACILITY_PRESETS,
  resolveRigFit,
  setRigSlot,
  type FacilityKind,
  type IndustryActivity,
} from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import type { MarketSnapshot } from './marketData';
import { materialPriceBasisOf } from './priceBasis';
import { parseTaxPct } from './planInputParsers';
import { costIndexSource, parseCostIndexPct } from './costIndexOverride';
import { buildLocationPatch } from './buildLocationPatch';
import { BuildLocationPicker } from './BuildLocationPicker';
import { BuildSystemInput } from './BuildSystemInput';
import { SourcingInput } from './SourcingInput';
import { PlanRigFitField } from './PlanRigFitField';
import { clearedBuildLocation, type PlanPatch } from './planPatch';
import type { MaterialPriceBasis } from '@/engine/industry/types';

interface PlanBuildLocationFieldsProps {
  plan: BuildPlanRecord;
  activity: IndustryActivity;
  hub: TradeHub;
  facilityPreset: (typeof FACILITY_PRESETS)[FacilityKind];
  buildSystem: { id: number; name: string } | null;
  buildLocationName: string | null;
  costIndexMissing: boolean;
  snapshot: MarketSnapshot | null;
  update: (patch: PlanPatch) => void;
  movePlan: (patch: PlanPatch) => void;
}

/** The plan's own Build Location: place picker, facility, system, rigs, tax, cost index, trade hub and price basis. */
export function PlanBuildLocationFields({
  plan,
  activity,
  hub,
  facilityPreset,
  buildSystem,
  buildLocationName,
  costIndexMissing,
  snapshot,
  update,
  movePlan,
}: PlanBuildLocationFieldsProps) {
  const { t } = useTranslation();
  return (
    <>
      <BuildLocationPicker
        activity={activity}
        summary={t('industry.buildLocationSummary', {
          facility: facilityPreset.name,
          system: buildSystem?.name ?? hub.systemName,
          security: t(`industry.${plan.security}`),
        })}
        selectedLabel={buildLocationName}
        onPick={(option) => movePlan(buildLocationPatch(option))}
      >
        <label className="flex flex-col gap-1 text-xs">
          {t('industry.facility')}
          <Select
            value={plan.facility}
            onValueChange={(value) => {
              const facility = value as FacilityKind;
              const structure = FACILITY_PRESETS[facility].structure;
              movePlan({
                facility,
                ...clearedBuildLocation,
                ...(structure ? {} : { rigFit: EMPTY_RIG_FIT, facilityTaxPct: undefined }),
              });
            }}
          >
            <SelectTrigger aria-label={t('industry.facility')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Only facilities that can actually run this plan's
                          activity — an Athanor can't manufacture, a Raitaru
                          can't react (issue #460). */}
              {Object.values(FACILITY_PRESETS)
                .filter((f) => f.activity === activity)
                .map((f) => (
                  <SelectItem key={f.kind} value={f.kind}>
                    {f.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </label>

        <BuildSystemInput
          systemName={buildSystem?.name}
          hubSystemName={hub.systemName}
          securityLabel={t(`industry.${plan.security}`)}
          onChange={(system) =>
            movePlan({
              buildSystemId: system?.id,
              buildSystemName: system?.name,
              ...clearedBuildLocation,
              // The band follows the system, so naming one settles the
              // rig multiplier too. An unreachable ESI leaves the plan
              // with the band it had rather than a guessed one.
              ...(system === null
                ? { security: hub.security }
                : system.security !== null
                  ? { security: system.security }
                  : {}),
            })
          }
        />
      </BuildLocationPicker>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* Only a player structure has rig slots or an owner-set tax, so an
                    NPC station shows neither rather than showing them dead. Both
                    are already cleared on the plan when the facility changes. */}
        {facilityPreset.structure && (
          <PlanRigFitField
            fit={resolveRigFit(plan)}
            facility={plan.facility}
            security={plan.security}
            onSlotChange={(slot, kind) =>
              update({ rigFit: setRigSlot(resolveRigFit(plan), slot, kind) })
            }
            onApplyFit={(fit) => update({ rigFit: fit })}
          />
        )}

        {facilityPreset.structure && (
          <div className="flex flex-col gap-1 text-xs">
            <span className="flex items-center gap-1">
              <label htmlFor="build-plan-facility-tax">{t('industry.facilityTax')}</label>
              <InfoTooltip
                label={t('industry.facilityTaxTooltipLabel')}
                content={t('industry.facilityTaxTooltip')}
              />
            </span>
            {/* Commits on blur/Enter, like Runs: a per-keystroke write
                        round-trips IndexedDB and re-resolves the whole plan, so
                        a controlled field lagged and could drop characters. */}
            <SourcingInput
              id="build-plan-facility-tax"
              value={plan.facilityTaxPct ?? 0}
              label={t('industry.facilityTax')}
              inputMode="decimal"
              widthClassName="w-full"
              parse={(raw) => parseTaxPct(plan.facilityTaxPct ?? 0, raw)}
              onCommit={(facilityTaxPct) => update({ facilityTaxPct })}
            />
          </div>
        )}

        {/* Only where ESI has no index for the Build location (J-Space) or
                    the pilot has already typed one: elsewhere ESI's figure is right
                    and a field would only invite overriding it. */}
        {(costIndexMissing || plan.costIndexOverridePct !== undefined) && (
          <div className="flex flex-col gap-1 text-xs">
            <span className="flex items-center gap-1">
              <label htmlFor="build-plan-cost-index">{t('industry.costIndexOverride')}</label>
              <InfoTooltip
                label={t('industry.costIndexOverrideTooltipLabel')}
                content={t('industry.costIndexOverrideTooltip')}
              />
            </span>
            <SourcingInput
              id="build-plan-cost-index"
              value={plan.costIndexOverridePct}
              label={t('industry.costIndexOverride')}
              inputMode="decimal"
              widthClassName="w-full"
              placeholder="0"
              mine={costIndexSource(snapshot, plan.costIndexOverridePct) === 'override'}
              describedBy={
                costIndexMissing && plan.costIndexOverridePct === undefined
                  ? 'build-plan-cost-index-note'
                  : undefined
              }
              parse={(raw) => {
                const parsed = parseCostIndexPct(raw);
                // Blank clears, unreadable keeps what was there.
                return parsed === undefined ? plan.costIndexOverridePct : (parsed ?? undefined);
              }}
              onCommit={(costIndexOverridePct) => update({ costIndexOverridePct })}
            />
            {costIndexMissing && plan.costIndexOverridePct === undefined && (
              <p id="build-plan-cost-index-note" className="text-warning">
                {t('industry.costIndexMissingNote')}
              </p>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs">
          {t('industry.tradeHub')}
          <Select
            value={plan.hubId}
            onValueChange={(value) => update({ hubId: value as BuildPlanRecord['hubId'] })}
          >
            <SelectTrigger aria-label={t('industry.tradeHub')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRADE_HUBS.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {/* Sits under Trade hub because it names a side of that hub's
                    order book, not a separate place. Materials only — the
                    product stays on lowest sell, which is what buying it
                    outright costs (GLOSSARY.md, Acquisition Verdict). */}
        <div className="flex flex-col gap-1 text-xs">
          <span className="flex items-center gap-1">
            <label htmlFor="build-plan-material-price-basis">
              {t('industry.materialPriceBasis')}
            </label>
            <InfoTooltip
              label={t('industry.materialPriceBasisTooltipLabel')}
              content={t('industry.materialPriceBasisTooltip')}
            />
          </span>
          <Select
            value={materialPriceBasisOf(plan.materialPriceBasis)}
            onValueChange={(value) => update({ materialPriceBasis: value as MaterialPriceBasis })}
          >
            <SelectTrigger
              id="build-plan-material-price-basis"
              aria-label={t('industry.materialPriceBasis')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sell">{t('industry.materialPriceBasisSell')}</SelectItem>
              <SelectItem value="buy">{t('industry.materialPriceBasisBuy')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}
