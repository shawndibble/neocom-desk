import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EditableValue, TextInput } from '@/components/ui';
import { formatPercent } from './formatPercent';

export function InlinePercent({
  fraction,
  name,
  min,
  max,
  onCommit,
  className,
}: {
  fraction: number;
  name: string;
  min: number;
  max: number;
  onCommit: (fraction: number) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const [refocus, setRefocus] = useState(false);
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
