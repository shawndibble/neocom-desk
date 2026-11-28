import type { ComponentPropsWithRef } from 'react';
import { cx } from '@/lib/cx';

export function TableScroll({ className, ...rest }: ComponentPropsWithRef<'div'>) {
  return <div {...rest} className={cx('overflow-x-auto edge-fade-end', className)} />;
}
