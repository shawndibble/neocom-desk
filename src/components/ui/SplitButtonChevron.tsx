import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cx } from '@/lib/cx';
import { Button } from './Button';
import { Expanded } from './icons';

interface SplitButtonChevronProps extends Omit<
  ComponentPropsWithoutRef<typeof Button>,
  'variant' | 'children' | 'aria-label'
> {
  label: string;
}

export const SplitButtonChevron = forwardRef<HTMLButtonElement, SplitButtonChevronProps>(
  function SplitButtonChevron({ label, className, ...rest }, ref) {
    return (
      <Button
        ref={ref}
        variant="primary"
        aria-label={label}
        className={cx('rounded-l-none border-l-accent-contrast/30 px-1!', className)}
        {...rest}
      >
        <Expanded aria-hidden="true" />
      </Button>
    );
  }
);
