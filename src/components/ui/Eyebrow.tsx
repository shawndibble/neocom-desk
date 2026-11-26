import type { ElementType, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { eyebrowClassName } from './eyebrowClassName';

interface EyebrowProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}

export function Eyebrow({ children, as: Tag = 'p', className }: EyebrowProps) {
  return <Tag className={cx(eyebrowClassName, className)}>{children}</Tag>;
}
