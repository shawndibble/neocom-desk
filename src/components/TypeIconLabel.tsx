import type { ReactNode } from 'react';
import { TypeIcon } from '@/components/ui';
import { cx } from '@/lib/cx';

interface TypeIconLabelProps {
  typeId: number;
  children: ReactNode;
  className?: string;
}

export function TypeIconLabel({ typeId, children, className }: TypeIconLabelProps) {
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5 align-middle', className)}>
      <TypeIcon typeId={typeId} size={32} className="h-4 w-4 shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </span>
  );
}
