import { createContext, useContext, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

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

// `form` lines a label up with its control's first line, not the middle of a tall stack.
const ROW: Record<FieldsVariant, string> = {
  compact: 'grid-cols-subgrid items-center gap-x-3 gap-y-2',
  form: 'grid-cols-subgrid items-center gap-x-6 gap-y-1.5 border-t border-line pt-3 first:border-t-0 first:pt-0 lg:items-baseline',
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
 * A stacked `form` row whose control is one small toggle keeps it on the
 * label's line, at the far edge, rather than alone on a line of its own.
 */
const INLINE_ROW =
  'grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1.5 border-t border-line pt-3 first:border-t-0 first:pt-0 lg:grid-cols-subgrid';
const INLINE_NOTE = 'col-span-full max-w-2xl text-text-dim lg:col-span-1 lg:col-start-2';

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
 * is for a lone checkbox in a `form` grid (see `INLINE_ROW`).
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
  return (
    <div className={cx('col-span-full grid', inlineRow ? INLINE_ROW : ROW[variant])}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelClassName}>
          {label}
        </label>
      ) : (
        <span className={labelClassName}>{label}</span>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
      {note !== undefined && note !== null && note !== false && (
        <p className={inlineRow ? INLINE_NOTE : NOTE[variant]}>{note}</p>
      )}
    </div>
  );
}
