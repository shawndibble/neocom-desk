import { useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, Field, FilterChip, Panel, SegmentedControl, Spinner } from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { FieldNoteContext } from '@/components/ui/fieldNote';

export function SettingsHint({ children }: { children: ReactNode }) {
  return <p className="max-w-2xl text-xs text-text-dim">{children}</p>;
}

export type SettingsScope = 'device';

export function SettingsScopeHint({ scope }: { scope: SettingsScope }) {
  const { t } = useTranslation();
  return <SettingsHint>{t(`settings.scope.${scope}`)}</SettingsHint>;
}

export function ActionResult({
  kind,
  children,
  className,
}: {
  kind: 'success' | 'info' | 'error';
  children: ReactNode;
  className?: string;
}) {
  const tone = { success: 'text-success', info: 'text-text-dim', error: 'text-danger' }[kind];
  const classes = `${className ? `${className} ` : ''}text-xs ${tone}`;
  return kind !== 'error' ? (
    <p role="status" aria-live="polite" className={classes}>
      {children}
    </p>
  ) : (
    <p role="alert" className={classes}>
      {children}
    </p>
  );
}

export function SettingsPanelLoading({ title }: { title?: string }) {
  return (
    <Panel title={title}>
      <Spinner />
    </Panel>
  );
}

export function SettingsFormLoading() {
  return <Spinner />;
}

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

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  const noteId = useContext(FieldNoteContext);
  return (
    <div role="group" aria-label={label} aria-describedby={noteId} className="flex flex-wrap gap-2">
      {children}
    </div>
  );
}

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

export function SegmentedRow<T extends string | number>({
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
  const noteId = useContext(FieldNoteContext);
  return (
    <Field label={label} note={hint}>
      <SegmentedControl
        label={label}
        describedBy={noteId}
        uppercase={false}
        options={options.map((o) => ({ value: String(o), label: labelFor(o) }))}
        value={String(selected)}
        onChange={(v) => onSelect(options.find((o) => String(o) === v) as T)}
      />
    </Field>
  );
}
