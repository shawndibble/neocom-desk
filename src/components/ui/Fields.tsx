import { createContext, useContext, useId, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { FieldNoteContext } from './fieldNote';

/**
 * `compact` is the fitting stats column's: dim 12px labels sized to their
 * longest, controls beside them at every width. `form` is a settings page's:
 * semibold labels, a hairline between rows, and the label stacked over its
 * control below `lg`, where a beside-it column would leave the control too
 * little room.
 */
export type FieldsVariant = 'compact' | 'form';

const VariantContext = createContext<FieldsVariant>('compact');

const GRID: Record<FieldsVariant, string> = {
  compact: 'grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-2',
  // `fit-content` lets a long label wrap at 16rem instead of squeezing the control column.
  form: 'grid-cols-1 gap-y-3 lg:grid-cols-[fit-content(16rem)_minmax(0,1fr)] lg:gap-x-6',
};

const FORM_ROW =
  'items-center gap-x-6 gap-y-1.5 border-t border-line pt-3 first:border-t-0 first:pt-0';

// `form` lines a label up with its control's first line, not the middle of a tall stack.
const ROW: Record<FieldsVariant, string> = {
  compact: 'grid-cols-subgrid items-center gap-x-3 gap-y-2',
  form: `grid-cols-subgrid lg:items-baseline ${FORM_ROW}`,
};

// Each tone spelled whole, so two colour utilities never meet on one element.
const LABEL: Record<FieldsVariant, Record<'normal' | 'warning', string>> = {
  compact: { normal: 'text-text-dim', warning: 'text-warning' },
  form: { normal: 'font-semibold', warning: 'font-semibold text-warning' },
};

const NOTE: Record<FieldsVariant, string> = {
  compact: 'col-start-2 -mt-1 text-[0.6875rem] text-text-dim',
  form: 'max-w-2xl text-text-dim lg:col-start-2',
};

/**
 * A `form` row whose control is one small toggle: the checkbox leads, the
 * label follows it, and the note sits under the label.
 */
const INLINE_ROW = `grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0 ${FORM_ROW}`;
const INLINE_NOTE = 'col-start-2 max-w-2xl text-text-dim';

/**
 * Labelled controls as a two-column grid of `Field`s: labels in one column,
 * controls lined up in the other, however long the labels or values are
 * (DESIGN.md §"Stacked controls line up").
 */
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

/**
 * One labelled control in a `Fields` grid. Each row is a subgrid, so it shares
 * the grid's columns while staying one element: a hairline can run across it
 * and a stacked row keeps its label, control and note together. `htmlFor`
 * makes the label a real `<label>` for a single control; leave it off for a
 * group (chips, a picker) that names itself. `note` reads dim beneath the
 * control; a `warning` label marks a setting moved off its default. `inline`
 * is for a lone checkbox in a `form` grid: checkbox first, then label and note (see `INLINE_ROW`).
 */
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
        {inlineRow && <div className="flex min-w-0 items-center">{children}</div>}
        {htmlFor ? (
          <label htmlFor={htmlFor} className={labelClassName}>
            {label}
          </label>
        ) : (
          <span className={labelClassName}>{label}</span>
        )}
        {!inlineRow && <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>}
        {hasNote && (
          <p id={noteId} className={inlineRow ? INLINE_NOTE : NOTE[variant]}>
            {note}
          </p>
        )}
      </div>
    </FieldNoteContext.Provider>
  );
}
