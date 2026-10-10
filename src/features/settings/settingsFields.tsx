/**
 * The small parts every Settings form is built from. Shared by the Settings
 * page and the page settings modal (`PageSettingsModal.tsx`), which render the
 * same forms, so the two can never disagree about a control.
 */
import { useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, FilterChip } from '@/components/ui';
import { FieldNoteContext } from '@/components/ui/fieldNote';

/** The line every synced-defaults form opens with. */
export function DefaultsSyncHint() {
  const { t } = useTranslation();
  return <p className="max-w-2xl text-xs text-text-dim">{t('settings.defaultsSyncHint')}</p>;
}

/** The chips' group, described by its `Field`'s note — a group has no `htmlFor` to hang one on. */
function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  const noteId = useContext(FieldNoteContext);
  return (
    <div role="group" aria-label={label} aria-describedby={noteId} className="flex flex-wrap gap-2">
      {children}
    </div>
  );
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
      <ChipGroup label={label}>
        {options.map((option) => (
          <FilterChip
            key={String(option)}
            label={labelFor(option)}
            selected={selected === option}
            onToggle={() => onSelect(option)}
          />
        ))}
      </ChipGroup>
    </Field>
  );
}
