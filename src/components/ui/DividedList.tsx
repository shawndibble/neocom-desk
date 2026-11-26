import { createElement, type HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

const SURFACE_CLASS = { 'panel-2': 'bg-panel-2', panel: 'bg-panel', none: '' } as const;

interface DividedListProps extends HTMLAttributes<HTMLElement> {
  surface?: keyof typeof SURFACE_CLASS;
  as?: 'div' | 'ul';
}

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
