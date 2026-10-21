/**
 * The Target cell of the corp assets ledger: the corporation's stock target for
 * one item type, edited in place. At rest it is a value (or a dim "—") in the
 * §6c popover-value cue, a dashed accent underline meaning "click to change
 * this". Click or Enter swaps it for a number field: Enter or leaving the field
 * saves, Escape cancels, and an empty field removes the target.
 */
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '@/components/ui';
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

  function finish(save: boolean) {
    if (done.current) return;
    done.current = true;
    if (save && draft !== null) {
      const text = draft.trim();
      if (text === '') {
        if (target !== undefined) onRemove();
      } else {
        const value = Number(text);
        if (!Number.isFinite(value) || value < 0) {
          // Keep the field open and say why.
          done.current = false;
          setInvalid(true);
          return;
        }
        const whole = Math.floor(value);
        if (whole === 0) {
          if (target !== undefined) onRemove();
        } else if (whole !== target) onChange(whole);
      }
    }
    setDraft(null);
    setInvalid(false);
    // The button remounts after the field unmounts; hand focus back to it.
    requestAnimationFrame(() => buttonRef.current?.focus());
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
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
          } else if (e.key === 'Escape') {
            // Cancels the edit, not an enclosing dialog or panel.
            e.preventDefault();
            e.stopPropagation();
            finish(false);
          }
        }}
        onBlur={() => finish(true)}
      />
      {invalid && (
        <span id={errorId} role="alert" className="sr-only">
          {t('corp.stockTargets.invalid')}
        </span>
      )}
    </>
  );
}
