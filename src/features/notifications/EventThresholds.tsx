import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import type { EventThresholds } from './eventEntries';
import type { ThresholdField, ThresholdKey } from './eventThresholdFields';
import type { CharacterEventThresholds } from './preferences';
import { parseIskAmount, formatIsk } from '@/lib/isk';

/**
 * One event's threshold controls, rendered from its Event Entry's
 * `thresholds` (issue #1285) rather than hand-written per event: a select per
 * `choice` field, an ISK field per `iskAmount` field, then the group's hint.
 * A single field sits in a plain block; several wrap side by side (corp
 * wallet's floor and ceiling).
 */
export function ThresholdControls({
  characterId,
  thresholds,
  values,
  onChange,
  showHint = true,
}: {
  characterId: number;
  thresholds: EventThresholds;
  values: Required<CharacterEventThresholds>;
  onChange: (key: ThresholdKey, amount: number) => void;
  /** False when the caller shows the group's hint once for several Characters. */
  showHint?: boolean;
}) {
  const { t } = useTranslation();
  const wraps = thresholds.fields.length > 1;
  return (
    <div className={wraps ? 'flex flex-wrap items-center gap-x-4 gap-y-1.5' : ''}>
      {thresholds.fields.map((field) => (
        <ThresholdFieldControl
          key={field.key}
          characterId={characterId}
          field={field}
          value={values[field.key]}
          onChange={(amount) => onChange(field.key, amount)}
        />
      ))}
      {showHint && thresholds.hintKey !== null && (
        <p className="mt-1 text-[0.6875rem] text-text-dim">{t(thresholds.hintKey)}</p>
      )}
    </div>
  );
}

function ThresholdFieldControl({
  characterId,
  field,
  value,
  onChange,
}: {
  characterId: number;
  field: ThresholdField;
  value: number;
  onChange: (amount: number) => void;
}) {
  const { t } = useTranslation();
  const { control } = field;
  if (control.kind === 'iskAmount') {
    return (
      <ThresholdAmountInput
        id={`${control.inputIdPrefix}-${characterId}`}
        label={t(control.labelKey)}
        labelHidden={control.labelHidden === true}
        value={value}
        onCommit={onChange}
      />
    );
  }
  return (
    <label className="flex items-center gap-2 text-[0.6875rem] text-text-dim">
      {t(control.labelKey)}
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger size="sm" aria-label={t(control.labelKey)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {control.options.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {t(control.optionKey, { count: option })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

/**
 * An ISK-amount threshold field (issue #299, extended for the wallet-balance
 * threshold): local text state so a mid-typing value like "50," or an empty
 * field never round-trips through `withCharacterEventThreshold` as `NaN`.
 * Commits on blur, matching the pattern used elsewhere for numeric fields
 * (`piPlan.tsx`); reverts to the last committed value on an invalid blur.
 *
 * Parsed with `parseIskAmount` (`lib/isk.ts`) rather than a bare `Number()`,
 * so "10.5m", "10,500,000" and "10500000" all commit to the same 10,500,000 —
 * a plain `<input type="number">` can't hold the shorthand-suffix forms, so
 * this is `type="text"` with a numeric-friendly `inputMode`.
 */
function ThresholdAmountInput({
  id,
  label,
  labelHidden,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  labelHidden: boolean;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(formatIsk(value));
  // Adjusted during render, not an effect (react-hooks/set-state-in-effect):
  // this is React's own "store info from previous renders" pattern for
  // resetting local state when a prop changes, not a DOM/external-system
  // sync — an actual effect would run one render late here.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(formatIsk(value));
  }

  function commit() {
    const amount = parseIskAmount(text);
    if (amount !== null && amount >= 0) {
      const rounded = Math.round(amount);
      onCommit(rounded);
      setText(formatIsk(rounded));
    } else {
      setText(formatIsk(value));
    }
  }

  return (
    <label htmlFor={id} className="flex items-center gap-2 text-[0.6875rem] text-text-dim">
      {labelHidden ? <span className="sr-only">{label}</span> : label}
      <TextInput
        id={id}
        size="sm"
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        className="w-32"
      />
    </label>
  );
}
