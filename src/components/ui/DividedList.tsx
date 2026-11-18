import { createElement, type HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

const SURFACE_CLASS = { 'panel-2': 'bg-panel-2', panel: 'bg-panel', none: '' } as const;

interface DividedListProps extends HTMLAttributes<HTMLElement> {
  /** Fill behind the rows. `none` for a list already on the surface it wants. */
  surface?: keyof typeof SURFACE_CLASS;
  /** `ul` when the children are `li`s. */
  as?: 'div' | 'ul';
}

/**
 * A bordered container whose rows are split by hairlines: a checklist, a
 * results list, a set of options. The rows own their padding and content.
 *
 * @summary A hairline-bordered box with `divide-y` rows.
 */
export function DividedList({
  surface = 'panel-2',
  as = 'div',
  className,
  ...rest
}: DividedListProps) {
  return createElement(as, {
    ...rest,
    className: cx(
      'divide-y divide-line rounded-xs border border-line',
      SURFACE_CLASS[surface],
      className
    ),
  });
}
