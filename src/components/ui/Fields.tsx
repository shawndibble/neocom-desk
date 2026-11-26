import { createContext, useContext, useId, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { eyebrowClassName } from './eyebrowClassName';
import { FieldNoteContext } from './fieldNote';

export type FieldsVariant = 'compact' | 'form';

const VariantContext = createContext<FieldsVariant>('compact');

const GRID: Record<FieldsVariant, string> = {
  compact: 'grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-2',
  form: 'grid-cols-1 gap-y-3 lg:grid-cols-[fit-content(16rem)_minmax(0,1fr)] lg:gap-x-6',
};

const FORM_ROW =
  'items-center gap-x-6 gap-y-1.5 border-t border-line pt-3 first:border-t-0 first:pt-0';

const ROW: Record<FieldsVariant, string> = {
  compact: 'grid-cols-subgrid items-center gap-x-3 gap-y-2',
  form: `grid-cols-subgrid lg:items-baseline ${FORM_ROW}`,
};

const LABEL: Record<FieldsVariant, Record<'normal' | 'warning', string>> = {
  compact: { normal: 'text-text-dim', warning: 'text-warning' },
  form: { normal: 'font-semibold', warning: 'font-semibold text-warning' },
};

const NOTE: Record<FieldsVariant, string> = {
  compact: 'col-start-2 -mt-1 text-[0.6875rem] text-text-dim',
  form: 'max-w-2xl text-text-dim lg:col-start-2',
};

const INLINE_ROW = `grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-subgrid ${FORM_ROW}`;
const INLINE_NOTE = 'col-span-full max-w-2xl text-text-dim lg:col-span-1 lg:col-start-2';

export function Fields({
  variant = 'compact',
  children,
}: {
  variant?: FieldsVariant;
  children: ReactNode;
}) {
  return (
    <VariantContext.Provider value={variant}>
      <div className={cx('grid text-xs', GRID[variant])}>{children}</div>
    </VariantContext.Provider>
  );
}

export function FieldsHeading({ children }: { children: ReactNode }) {
  return (
    <h3
      className={cx(eyebrowClassName, 'col-span-full pt-3 first:pt-0 [&+*]:border-t-0 [&+*]:pt-0')}
    >
      {children}
    </h3>
  );
}

export function Field({
  label,
  htmlFor,
  tone,
  note,
  inline = false,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  tone?: 'warning';
  note?: ReactNode;
  inline?: boolean;
  children: ReactNode;
}) {
  const variant = useContext(VariantContext);
  const labelClassName = LABEL[variant][tone ?? 'normal'];
  const inlineRow = inline && variant === 'form';
  const noteId = useId();
  const hasNote = note !== undefined && note !== null && note !== false;
  return (
    <FieldNoteContext.Provider value={hasNote ? noteId : undefined}>
      <div className={cx('col-span-full grid', inlineRow ? INLINE_ROW : ROW[variant])}>
        {htmlFor ? (
          <label htmlFor={htmlFor} className={labelClassName}>
            {label}
          </label>
        ) : (
          <span className={labelClassName}>{label}</span>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
        {hasNote && (
          <p id={noteId} className={inlineRow ? INLINE_NOTE : NOTE[variant]}>
            {note}
          </p>
        )}
      </div>
    </FieldNoteContext.Provider>
  );
}
