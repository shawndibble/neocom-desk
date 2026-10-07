import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

/** A full-width navigating row: panel-2 hover, inset focus ring, `group` for the trailing caret. */
export const boardRowLinkBase = cx(
  'group flex min-h-11 items-center px-3',
  rowInteractiveClassName,
  focusRingInsetClassName
);
export const boardRowLinkClassName = cx(boardRowLinkBase, 'gap-2.5 py-1.5 md:min-h-9');
