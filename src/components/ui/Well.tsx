import { createElement, type HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

const WELL_SIZE_CLASS = { sm: 'p-2', md: 'p-2.5', lg: 'p-3' } as const;

interface WellProps extends HTMLAttributes<HTMLElement> {
  size?: keyof typeof WELL_SIZE_CLASS;
  as?: 'div' | 'p' | 'section' | 'li';
}

/**
 * @summary An inset `panel-2` box with a hairline, for a note or readout inside a Panel or dialog.
 */
export function Well({ size = 'sm', as = 'div', className, ...rest }: WellProps) {
  return createElement(as, {
    ...rest,
    className: cx('rounded-xs border border-line bg-panel-2', WELL_SIZE_CLASS[size], className),
  });
}
