import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldError, TextInput } from '@/components/ui';
import { maskNumber, unmaskNumber } from '@/lib/numberMask';

interface MaxIskInputProps {
  /** The saved limit; null for none. */
  value: number | null;
  onChange: (value: number | null) => void;
}

/**
 * The plan's max ISK per haul. Blank is no limit. A bad entry keeps the last
 * good plan on screen; it is never read as no limit.
 */
export function MaxIskInput({ value, onChange }: MaxIskInputProps) {
  const { t } = useTranslation();
  const errorId = useId();
  const [text, setText] = useState(value === null ? '' : maskNumber(value));
  const [seen, setSeen] = useState(value);
  // The saved value arrives after hydration, or changes elsewhere: show it unless it is what was typed.
  if (value !== seen) {
    setSeen(value);
    const shown = text.trim() === '' ? null : (unmaskNumber(text) ?? null);
    if (value !== shown) setText(value === null ? '' : maskNumber(value));
  }
  const blank = text.trim() === '';
  const typed = blank ? null : unmaskNumber(text);
  const invalid = !blank && (typed === undefined || typed === null || typed <= 0);

  function onType(raw: string) {
    setText(raw);
    if (raw.trim() === '') return onChange(null);
    const next = unmaskNumber(raw);
    if (next !== undefined && next > 0) onChange(next);
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-xs tracking-wide text-text-dim uppercase">
          {t('assets.movePlan.maxIskLabel')}
        </span>
        <TextInput
          size="sm"
          inputMode="decimal"
          className="w-40"
          placeholder={t('assets.movePlan.maxIskPlaceholder')}
          value={text}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => onType(e.target.value)}
        />
        <span className="text-sm text-text-dim">ISK</span>
      </label>
      {invalid && (
        <FieldError id={errorId} className="text-xs">
          {t('assets.movePlan.customInvalid')}
        </FieldError>
      )}
    </div>
  );
}
