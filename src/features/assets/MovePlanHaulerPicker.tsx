import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FieldError,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import {
  customM3Problem,
  MAX_CUSTOM_HAULS,
  type HaulerOverride,
  type MovePlan,
} from '@/engine/assets/movePlan';
import { ownedFirstOrder, ownedText } from './ownedHullText';
import { maskNumber, unmaskNumber } from '@/lib/numberMask';

const CUSTOM = 'custom';

interface HaulerPickerProps {
  plan: MovePlan;
  override: HaulerOverride | undefined;
  /** Undefined goes back to the suggested hauler. */
  onPick: (override: HaulerOverride | undefined) => void;
  /** List owned hulls first; the plan's own ranking is untouched. */
  ownedFirst?: boolean;
}

/**
 * Per-plan hauler choice: the suggested hull, any other listed hull, or one
 * typed m³. Lives only as long as the plan; the saved Cargo Space is never touched.
 */
export function HaulerPicker({ plan, override, onPick, ownedFirst = false }: HaulerPickerProps) {
  const { t } = useTranslation();
  const errorId = useId();
  const [customMode, setCustomMode] = useState(override !== undefined && 'customM3' in override);
  const [text, setText] = useState(
    override && 'customM3' in override ? maskNumber(override.customM3) : ''
  );
  const { totalM3 } = plan.totals;
  /** Why the typed size cannot be used; blank and garbage read as not a number. */
  const problem = (raw: string) => {
    const value = unmaskNumber(raw);
    return value === undefined ? 'invalid' : customM3Problem(value, totalM3);
  };
  const shown = customMode ? problem(text) : null;
  const suggestedId = plan.suggested?.hull.typeId;
  const activeId = plan.active?.hull.typeId;

  function choose(value: string) {
    if (value === CUSTOM) {
      setCustomMode(true);
      const start = Math.round(plan.active?.hull.capacityM3 ?? 0);
      const seed = start > 0 && customM3Problem(start, totalM3) === null ? start : null;
      setText(seed === null ? '' : maskNumber(seed));
      if (seed !== null) onPick({ customM3: seed });
      return;
    }
    setCustomMode(false);
    const hullTypeId = Number(value);
    onPick(hullTypeId === suggestedId ? undefined : { hullTypeId });
  }

  function onType(raw: string) {
    setText(raw);
    // A bad entry keeps the last good plan on screen; it is never read as unlimited.
    if (problem(raw) === null) onPick({ customM3: unmaskNumber(raw)! });
  }

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <label className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="text-xs tracking-wide text-text-dim uppercase">
          {t('assets.movePlan.haulerLabel')}
        </span>
        <Select
          value={customMode ? CUSTOM : activeId === undefined ? '' : String(activeId)}
          onValueChange={choose}
        >
          <SelectTrigger size="sm" aria-label={t('assets.movePlan.haulerLabel')}>
            <SelectValue placeholder={t('assets.movePlan.noHaulerOption')} />
          </SelectTrigger>
          <SelectContent>
            {ownedFirstOrder(plan.comparison, ownedFirst).map((o) => (
              <SelectItem key={o.hull.typeId} value={String(o.hull.typeId)}>
                {[
                  o.hull.typeId === suggestedId
                    ? t('assets.movePlan.haulerSuggestedOption', { hull: o.hull.name })
                    : o.hull.name,
                  ownedText(t, o.hull),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM}>{t('assets.movePlan.customOption')}</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {customMode && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <TextInput
              aria-label={t('assets.movePlan.customAria')}
              size="sm"
              inputMode="decimal"
              className="w-32"
              value={text}
              aria-invalid={shown !== null || undefined}
              aria-describedby={shown !== null ? errorId : undefined}
              onChange={(e) => onType(e.target.value)}
            />
            <span className="text-sm text-text-dim">m³</span>
          </div>
          {shown && (
            <FieldError id={errorId} className="text-xs">
              {shown === 'tooSmall'
                ? t('assets.movePlan.customTooSmall', {
                    min: maskNumber(Math.ceil(totalM3 / MAX_CUSTOM_HAULS)),
                  })
                : t('assets.movePlan.customInvalid')}
            </FieldError>
          )}
        </div>
      )}
    </div>
  );
}
