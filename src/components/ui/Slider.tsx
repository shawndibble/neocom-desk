import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { disabledClassName, focusRingClassName, interactiveClassName } from './controlStyles';
import { useDescribedBy } from './fieldNote';

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  valueText?: string;
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { className, valueText, 'aria-describedby': describedBy, ...rest },
  ref
) {
  const described = useDescribedBy(describedBy);
  return (
    <input
      ref={ref}
      type="range"
      className={cx(
        'h-9 w-full min-w-0 cursor-pointer accent-accent md:h-6 touch:h-9',
        interactiveClassName,
        focusRingClassName,
        disabledClassName,
        className
      )}
      {...rest}
      aria-valuetext={valueText}
      aria-describedby={described}
    />
  );
});
