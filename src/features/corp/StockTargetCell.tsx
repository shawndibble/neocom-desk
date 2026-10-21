/**
 * The Target cell of the corp assets ledger: the corporation's stock target for
 * one item type, edited in place. At rest it is a value (or a dim "—") in the
 * §6c popover-value cue, a dashed accent underline meaning "click to change
 * this". Click or Enter swaps it for a number field: Enter or leaving the field
 * saves, Escape cancels, and only a truly empty field removes the target; an
 * entry that is not a whole number of at least 1 shows why and stays open.
 */
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
  /** Names the control for a screen reader: "Target for Tritanium". */
  itemName: string;
  /** The current target, or undefined when the type has none. */
  target: number | undefined;
  /** A whole number of at least 1. */
  onChange: (target: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const errorId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Escape and Enter finish the edit themselves; the blur that follows must not save again.
  const done = useRef(false);
  // A number field reports unparsable text ("1e") as an empty value; badInput tells them apart.
  const badInput = useRef(false);

  /** `keyboard` exits (Enter, Escape) hand focus back to the cell; a blur never does. */
  function finish(save: boolean, keyboard: boolean) {
    if (done.current) return;
    if (save && draft !== null) {
      const text = draft.trim();
      if (text === '' && !badInput.current) {
        // Only a truly empty field removes the target.
        if (target !== undefined) onRemove();
      } else {
        const value = text === '' ? Number.NaN : Number(text);
        const whole = Math.floor(value);
        if (!Number.isFinite(value) || whole < 1) {
          // Keep the field open and say why; nothing is saved or removed.
          setInvalid(true);
          return;
        }
        if (whole !== target) onChange(whole);
      }
    }
    done.current = true;
    setDraft(null);
    setInvalid(false);
    // The button remounts after the field unmounts.
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
          'tabular-nums touch:min-h-11',
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
            // Cancels the edit, not an enclosing dialog or panel.
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
