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
