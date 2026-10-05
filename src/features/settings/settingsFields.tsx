/**
 * The small parts every Settings form is built from. Shared by the Settings
 * page and the page settings modal (`PageSettingsModal.tsx`), which render the
 * same forms, so the two can never disagree about a control.
 */
import { useTranslation } from 'react-i18next';
import { Field, FilterChip } from '@/components/ui';

/** The line every synced-defaults form opens with. */
export function DefaultsSyncHint() {
  const { t } = useTranslation();
  return <p className="max-w-2xl text-xs text-text-dim">{t('settings.defaultsSyncHint')}</p>;
}

/** A labelled row of preset chips — the shape every threshold control here uses; a `Fields` row. */
export function ChipRow<T extends string | number>({
  label,
  hint,
  options,
  selected,
  onSelect,
  labelFor,
}: {
  label: string;
  hint?: string;
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  labelFor: (value: T) => string;
}) {
  return (
    <Field label={label} note={hint}>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => (
          <FilterChip
            key={String(option)}
            label={labelFor(option)}
            selected={selected === option}
            onToggle={() => onSelect(option)}
          />
        ))}
      </div>
    </Field>
  );
}
