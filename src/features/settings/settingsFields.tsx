/**
 * The small parts every Settings form is built from. Shared by the Settings
 * page and the page settings modal (`PageSettingsModal.tsx`), which render the
 * same forms, so the two can never disagree about a control.
 */
import { useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, Field, FilterChip, Panel, Spinner } from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { FieldNoteContext } from '@/components/ui/fieldNote';

/** The paragraph above a form: one width cap and one size for every Settings panel. */
export function SettingsHint({ children }: { children: ReactNode }) {
  return <p className="max-w-2xl text-xs text-text-dim">{children}</p>;
}

/** Where a setting lives: on every device through sync, or on this one only. */
export type SettingsScope = 'synced' | 'device';

/** The one fixed line a panel opens with to say where its settings live. */
export function SettingsScopeHint({ scope }: { scope: SettingsScope }) {
  const { t } = useTranslation();
  return <SettingsHint>{t(`settings.scope.${scope}`)}</SettingsHint>;
}

/** The line every synced-defaults form opens with. */
export function DefaultsSyncHint() {
  return <SettingsScopeHint scope="synced" />;
}

/** A success or error line after a button press. Success is a polite status; an error is an alert. */
export function ActionResult({
  kind,
  children,
  className,
}: {
  kind: 'success' | 'error';
  children: ReactNode;
  className?: string;
}) {
  const tone = kind === 'success' ? 'text-success' : 'text-danger';
  const classes = `${className ? `${className} ` : ''}text-xs ${tone}`;
  return kind === 'success' ? (
    <p role="status" aria-live="polite" className={classes}>
      {children}
    </p>
  ) : (
    <p role="alert" className={classes}>
      {children}
    </p>
  );
}

/** A Settings panel while its stores hydrate: the same `Panel` frame, a centred spinner. */
export function SettingsPanelLoading({ title }: { title?: string }) {
  return (
    <Panel title={title}>
      <Spinner />
    </Panel>
  );
}

/** One lone-checkbox row of the Settings form grid, hint as the row's note. */
export function CheckboxField({
  id,
  label,
  hint,
  checked,
  onChange,
  scope,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: () => void;
  /** Set only where this field's scope differs from its panel's. */
  scope?: SettingsScope;
}) {
  const { t } = useTranslation();
  return (
    <Field
      label={label}
      htmlFor={id}
      inline
      note={
        scope ? (
          <>
            {hint} {t(`settings.scope.${scope}Field`)}
          </>
        ) : (
          hint
        )
      }
    >
      <label className={touchCheckboxLabelClassName}>
        <Checkbox id={id} checked={checked} onChange={onChange} />
      </label>
    </Field>
  );
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
