import type { ElementType, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { eyebrowClassName } from './eyebrowClassName';

interface EyebrowProps {
  children: ReactNode;
  /** The element to render; pick the one the document outline needs. */
  as?: ElementType;
  /** Spacing and layout only; the type recipe is fixed. */
  className?: string;
}

/**
 * A small uppercase label that names what follows: a section, a field, a
 * table group (DESIGN.md §6c "Eyebrow"). Static text: no cue, no action.
 */
export function Eyebrow({ children, as: Tag = 'p', className }: EyebrowProps) {
  return <Tag className={cx(eyebrowClassName, className)}>{children}</Tag>;
}
