import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldError, NativeSelect, TextInput } from '@/components/ui';
import {
  CUSTOM_HAULER_TYPE_ID,
  type HaulerOverride,
  type MovePlan,
} from '@/engine/assets/movePlan';
import { maskNumber, unmaskNumber } from '@/lib/numberMask';

const CUSTOM = 'custom';

interface HaulerPickerProps {
  plan: MovePlan;
  override: HaulerOverride | undefined;
  /** Undefined goes back to the suggested hauler. */
  onPick: (override: HaulerOverride | undefined) => void;
}

/**
 * Per-plan hauler choice: the suggested hull, any other listed hull, or one
 * typed m³. Lives only as long as the plan; the saved Cargo Space is never touched.
 */
export function HaulerPicker({ plan, override, onPick }: HaulerPickerProps) {
  const { t } = useTranslation();
  const errorId = useId();
  const [customMode, setCustomMode] = useState(override !== undefined && 'customM3' in override);
  const [text, setText] = useState(
    override && 'customM3' in override ? maskNumber(override.customM3) : ''
  );
  const typed = unmaskNumber(text);
  const invalid = customMode && !(typed !== undefined && typed > 0 && Number.isFinite(typed));
  const suggestedId = plan.suggested?.hull.typeId;
  const activeId = plan.active?.hull.typeId;

  function choose(value: string) {
    if (value === CUSTOM) {
      setCustomMode(true);
      const start = plan.active?.hull.capacityM3 ?? 0;
      const seed = start > 0 ? maskNumber(Math.round(start)) : '';
      setText(seed);
      if (seed) onPick({ customM3: Math.round(start) });
      return;
    }
    setCustomMode(false);
    const hullTypeId = Number(value);
    onPick(hullTypeId === suggestedId ? undefined : { hullTypeId });
  }

  function type(raw: string) {
    setText(raw);
    const value = unmaskNumber(raw);
    // A bad entry keeps the last good plan on screen; it is never read as unlimited.
    if (value !== undefined && value > 0 && Number.isFinite(value)) onPick({ customM3: value });
  }

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-xs tracking-wide text-text-dim uppercase">
          {t('assets.movePlan.haulerLabel')}
        </span>
        <NativeSelect
          size="sm"
          value={customMode ? CUSTOM : activeId === undefined ? '' : String(activeId)}
          onChange={(e) => choose(e.target.value)}
        >
          {activeId === undefined && !customMode && (
            <option value="" disabled>
              {t('assets.movePlan.noHaulerOption')}
            </option>
          )}
          {plan.comparison
            .filter((o) => o.hull.typeId !== CUSTOM_HAULER_TYPE_ID)
            .map((o) => (
              <option key={o.hull.typeId} value={o.hull.typeId}>
                {o.hull.typeId === suggestedId
                  ? t('assets.movePlan.haulerSuggestedOption', { hull: o.hull.name })
                  : o.hull.name}
              </option>
            ))}
          <option value={CUSTOM}>{t('assets.movePlan.customOption')}</option>
        </NativeSelect>
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
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
              onChange={(e) => type(e.target.value)}
            />
            <span className="text-sm text-text-dim">m³</span>
          </div>
          {invalid && (
            <FieldError id={errorId} className="text-xs">
              {t('assets.movePlan.customInvalid')}
            </FieldError>
          )}
        </div>
      )}
    </div>
  );
}
