import { createElement, type HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

const WELL_SIZE_CLASS = { sm: 'p-2', md: 'p-2.5', lg: 'p-3' } as const;

interface WellProps extends HTMLAttributes<HTMLElement> {
  /** Padding: `sm` 8px, `md` 10px, `lg` 12px. */
  size?: keyof typeof WELL_SIZE_CLASS;
  /** Element to render; a `p` for a sentence, a `li` inside a list. */
  as?: 'div' | 'p' | 'section' | 'li';
}

/**
 * An inset box inside a `Panel` or dialog: a `panel-2` fill and a `line`
 * hairline, for a fact block, a note or a readout that sits apart from the
 * text around it. Panels do not nest (DESIGN.md §4); this is the fill they
 * use inside. Layout (`space-y-*`, `flex`, `grid`) comes through `className`.
 *
 * @summary An inset `panel-2` box with a hairline, for a note or readout inside a Panel or dialog.
 */
export function Well({ size = 'sm', as = 'div', className, ...rest }: WellProps) {
  return createElement(as, {
    ...rest,
    className: cx('rounded-xs border border-line bg-panel-2', WELL_SIZE_CLASS[size], className),
  });
}
