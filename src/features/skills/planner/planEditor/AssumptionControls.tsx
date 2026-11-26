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
import { AcceleratorSection } from '../AcceleratorSection';
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
    characterId,
    runningAccelerator,
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

      {whatIf.kind === 'custom' ? (
        <div
          role="group"
          aria-label={t('plans.whatIfPerAttribute')}
          className="grid grid-cols-5 gap-1"
        >
          {ATTRIBUTE_NAMES.map((name) => (
            <label key={name} className="flex flex-col items-center gap-0.5">
              <span className="text-[0.6875rem] tracking-widest text-text-dim uppercase">
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

      <AcceleratorSection
        characterId={characterId}
        running={runningAccelerator}
        detectedBonus={detectedAccelerator}
      />
    </div>
  );
}
