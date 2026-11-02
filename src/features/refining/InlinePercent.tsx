import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EditableValue, TextInput } from '@/components/ui';
import { formatPercent } from './formatPercent';

/**
 * A percent shown as text and edited in place (DESIGN.md §6c, faint pencil):
 * a click, or a digit typed on it, swaps in a field. Enter or blur saves,
 * Escape cancels, and focus goes back to the value. The caller gets a
 * fraction (54% -> 0.54); an entry outside `[min, max]` percent, or not a
 * number, is dropped rather than saved.
 */
export function InlinePercent({
  fraction,
  name,
  min,
  max,
  onCommit,
  className,
}: {
  /** The value shown at rest, as a fraction. */
  fraction: number;
  /** What the value is, already translated: "Facility yield". The field is named this; the value's button reads "Edit …". */
  name: string;
  /** Percent bounds, inclusive. */
  min: number;
  max: number;
  onCommit: (fraction: number) => void;
  /** Extra classes for the value's button at rest (the field in edit mode is unaffected). */
  className?: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const [refocus, setRefocus] = useState(false);
  // Set once Enter or Escape has settled the field, so the blur that follows does not save again.
  const closed = useRef(true);
  const seeded = useRef(false);

  function close(save: boolean, focusBack: boolean) {
    if (closed.current) return;
    closed.current = true;
    const percent = Number((draft ?? '').replace(',', '.'));
    if (save && draft?.trim() && Number.isFinite(percent) && percent >= min && percent <= max) {
      const next = percent / 100;
      if (Math.abs(next - fraction) > 1e-9) onCommit(next);
    }
    setDraft(null);
    setRefocus(focusBack);
  }

  if (draft !== null) {
    return (
      <TextInput
        size="sm"
        // Text with a decimal keypad, not type="number": a seeded digit needs
        // the caret after it, and a number field can't place its caret.
        inputMode="decimal"
        autoFocus
        aria-label={name}
        className="w-16 text-right"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          const field = e.currentTarget;
          if (seeded.current) field.setSelectionRange(field.value.length, field.value.length);
          else field.select();
        }}
        onClick={(e) => e.stopPropagation()}
        onBlur={() => close(true, false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Focus moves to the value's button as the field closes; left alone, this same keystroke's
            // default action would then press that button and open the field again.
            e.preventDefault();
            close(true, true);
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            close(false, true);
          }
        }}
      />
    );
  }
  return (
    <EditableValue
      className={className}
      label={t('refining.editValue', { name })}
      focusOnMount={refocus}
      onFocused={() => setRefocus(false)}
      onEdit={(seed) => {
        closed.current = false;
        const digit = seed !== undefined && /^[\d.,]$/.test(seed);
        seeded.current = digit;
        setDraft(digit ? seed : formatPercent(fraction, false));
      }}
    >
      {formatPercent(fraction)}
    </EditableValue>
  );
}
