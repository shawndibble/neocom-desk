import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { eyebrowClassName, FieldError, TextInput } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { maskNumber, unmaskNumber } from '@/lib/numberMask';

const COMMIT_DELAY_MS = 500;

interface MaxIskInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export function MaxIskInput({ value, onChange }: MaxIskInputProps) {
  const { t } = useTranslation();
  const errorId = useId();
  const [text, setText] = useState(value === null ? '' : maskNumber(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    const shown = text.trim() === '' ? null : (unmaskNumber(text) ?? null);
    if (value !== shown) setText(value === null ? '' : maskNumber(value));
  }
  const blank = text.trim() === '';
  const typed = blank ? null : unmaskNumber(text);
  const invalid = !blank && (typed === undefined || typed === null || typed <= 0);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function onType(raw: string) {
    setText(raw);
    clearTimeout(timer.current);
    const next = raw.trim() === '' ? null : unmaskNumber(raw);
    if (next === undefined || next === 0) return;
    timer.current = setTimeout(() => onChange(next), COMMIT_DELAY_MS);
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-wrap items-center gap-2">
        <span className={eyebrowClassName}>
          <HintText content={t('assets.movePlan.maxIskHint')}>
            {t('assets.movePlan.maxIskLabel')}
          </HintText>
        </span>
        <TextInput
          size="sm"
          inputMode="decimal"
          className="w-40 font-mono tabular-nums"
          placeholder={t('assets.movePlan.maxIskPlaceholder')}
          value={text}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => onType(e.target.value)}
        />
        {!blank && <span className="text-sm text-text-dim">{t('assets.movePlan.maxIskUnit')}</span>}
      </label>
      {invalid && (
        <FieldError id={errorId} className="text-xs">
          {t('assets.movePlan.customInvalid')}
        </FieldError>
      )}
    </div>
  );
}
