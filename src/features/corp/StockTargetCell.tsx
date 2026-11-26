import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldError, TextInput } from '@/components/ui';
import { popoverValueClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/numberLocale';

export function StockTargetCell({
  itemName,
  target,
  onChange,
  onRemove,
}: {
  itemName: string;
  target: number | undefined;
  onChange: (target: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const errorId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const done = useRef(false);
  const badInput = useRef(false);

  function finish(save: boolean, keyboard: boolean) {
    if (done.current) return;
    if (save && draft !== null) {
      const text = draft.trim();
      if (text === '' && !badInput.current) {
        if (target !== undefined) onRemove();
      } else {
        const value = text === '' ? Number.NaN : Number(text);
        const whole = Math.floor(value);
        if (!Number.isFinite(value) || whole < 1) {
          setInvalid(true);
          return;
        }
        if (whole !== target) onChange(whole);
      }
    }
    done.current = true;
    setDraft(null);
    setInvalid(false);
    if (keyboard) requestAnimationFrame(() => buttonRef.current?.focus());
  }

  const label = t('corp.stockTargets.cellLabel', { name: itemName });

  if (draft === null) {
    return (
      <button
        ref={buttonRef}
        type="button"
        aria-label={
          target === undefined
            ? t('corp.stockTargets.cellSet', { name: itemName })
            : t('corp.stockTargets.cellEdit', { name: itemName, count: target })
        }
        className={cx(
          popoverValueClassName,
          'tabular-nums touch:min-h-9',
          target === undefined && 'text-text-dim'
        )}
        onClick={() => {
          done.current = false;
          badInput.current = false;
          setDraft(target === undefined ? '' : String(target));
        }}
      >
        {target === undefined ? '—' : formatNumber(target)}
      </button>
    );
  }

  return (
    <>
      <TextInput
        autoFocus
        size="sm"
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className="w-24 text-right tabular-nums"
        value={draft}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          badInput.current = e.target.validity.badInput;
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true, true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            finish(false, true);
          }
        }}
        onBlur={() => finish(true, false)}
      />
      {invalid && (
        <FieldError id={errorId} className="block text-xs">
          {t('corp.stockTargets.invalid')}
        </FieldError>
      )}
    </>
  );
}
