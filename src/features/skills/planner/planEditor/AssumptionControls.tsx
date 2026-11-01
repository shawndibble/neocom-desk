import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import type { WhatIfImplantPreset } from '@/db';
import { ATTRIBUTE_NAMES } from '@/engine/optimizer';
import type { Implants } from '@/engine/types';
import { BoosterList } from '../BoosterList';
import { MarketGroupLink } from '../MarketGroupLink';
import { ATTRIBUTE_ENHANCERS_MARKET_GROUP_ID } from '../plannerMarketGroups';
import { attributeShort } from '../remapInstruction';
import {
  cloneSelection,
  MAX_IMPLANT_BONUS,
  MIN_IMPLANT_BONUS,
  setWhatIfBonus,
  toCustomSelection,
  WHAT_IF_IMPLANT_PRESETS,
} from '../whatIfImplants';
import type { usePlanAssumptions } from './usePlanAssumptions';

/** The Assumptions section's controls: Alpha Clone, What-If Implants (preset or per-slot) and Boosters. */
export function AssumptionControls({
  assumptions,
  alphaCappedCount,
  implants,
}: {
  assumptions: ReturnType<typeof usePlanAssumptions>;
  alphaCappedCount: number;
  implants: Implants;
}) {
  const { t } = useTranslation();
  const {
    cloneState,
    cloneStatesHydrated,
    setCloneState,
    whatIf,
    setWhatIf,
    jumpClones,
    matchedCloneId,
    effectiveImplants,
    planBoosters,
    setPlanBoosters,
    detectedAccelerator,
  } = assumptions;
  return (
    <div className="space-y-2 text-xs">
      <label className={`flex items-center gap-1.5 ${tappableRowClassName}`}>
        <Checkbox
          checked={cloneState === 'alpha'}
          disabled={!cloneStatesHydrated}
          onChange={(e) => setCloneState(e.target.checked ? 'alpha' : 'omega')}
        />
        {t('plans.alphaClone')}
      </label>
      <p className="text-[0.6875rem] text-text-dim">{t('plans.alphaCloneNote')}</p>
      {alphaCappedCount > 0 && (
        <p className="text-warning">{t('plans.alphaCappedCount', { count: alphaCappedCount })}</p>
      )}

      <div className="flex items-center gap-1">
        <label className="flex flex-1 items-center justify-between gap-2">
          {t('plans.whatIfImplants')}
          <Select
            value={
              matchedCloneId !== null
                ? `clone:${matchedCloneId}`
                : whatIf.kind === 'custom'
                  ? 'custom'
                  : whatIf.preset
            }
            // Picking 'custom' freezes what is in force into five editable
            // slots without changing a number (toCustomSelection).
            onValueChange={(value) => {
              const clone = jumpClones.find((c) => `clone:${c.id}` === value);
              setWhatIf(
                clone
                  ? cloneSelection(clone)
                  : value === 'custom'
                    ? toCustomSelection(whatIf, implants)
                    : { kind: 'preset', preset: value as WhatIfImplantPreset }
              );
            }}
          >
            <SelectTrigger size="md" aria-label={t('plans.whatIfImplants')} className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WHAT_IF_IMPLANT_PRESETS.map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {preset === 'none'
                    ? t('plans.whatIfNone')
                    : preset === 'current'
                      ? t('plans.whatIfCurrent')
                      : preset}
                </SelectItem>
              ))}
              {jumpClones.map((clone) => (
                <SelectItem key={clone.id} value={`clone:${clone.id}`}>
                  {t('plans.whatIfJumpClone', { label: clone.label })}
                </SelectItem>
              ))}
              <SelectItem value="custom">{t('plans.whatIfCustom')}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <MarketGroupLink
          groupId={ATTRIBUTE_ENHANCERS_MARKET_GROUP_ID}
          label={t('plans.whatIfMarketLink')}
        />
      </div>

      {/* EVE's hardwirings are per slot (+4 PER / +5 INT / nothing in
              CHA), which a uniform preset cannot say. One row of five, shown
              only under "Custom" (pick it, or edit a value): editing one
              leaves the other four alone. Under a preset a one-line readout
              says what the plan is being costed against. The three-letter codes are the same abbreviation the
              entry list's attribute-pair badge uses; each input's accessible
              name spells the attribute out. */}
      {whatIf.kind === 'custom' ? (
        <div
          role="group"
          aria-label={t('plans.whatIfPerAttribute')}
          className="grid grid-cols-5 gap-1"
        >
          {ATTRIBUTE_NAMES.map((name) => (
            <label key={name} className="flex flex-col items-center gap-0.5">
              <span className="text-[0.625rem] tracking-widest text-text-dim uppercase">
                {attributeShort(name)}
              </span>
              <TextInput
                size="md"
                type="number"
                min={MIN_IMPLANT_BONUS}
                max={MAX_IMPLANT_BONUS}
                step={1}
                aria-label={t('plans.whatIfAttributeBonus', {
                  attribute: t(`skills.attr.${name}`),
                })}
                value={effectiveImplants[name]}
                onChange={(e) =>
                  setWhatIf(setWhatIfBonus(whatIf, implants, name, Number(e.target.value)))
                }
                // `field-no-spinner` (src/styles/index.css): Chrome draws
                // the spin buttons on hover and focus into a 29.6px content
                // box, taking about half of it and shoving the digit left —
                // so the cell under the cursor would break the row's
                // alignment with the other four.
                className="field-no-spinner w-full text-center"
              />
            </label>
          ))}
        </div>
      ) : (
        <p className="text-[0.6875rem] text-text-dim">
          {ATTRIBUTE_NAMES.map(
            (name) => `${attributeShort(name)} +${effectiveImplants[name]}`
          ).join(' · ')}
        </p>
      )}

      <BoosterList
        boosters={planBoosters}
        detectedAccelerator={detectedAccelerator}
        onChange={setPlanBoosters}
      />
    </div>
  );
}
