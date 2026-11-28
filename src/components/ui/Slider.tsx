import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { disabledClassName, focusRingClassName, interactiveClassName } from './controlStyles';
import { useDescribedBy } from './fieldNote';

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  valueText?: string;
}

/** @summary A native range input in the house recipe: drag, click or arrow-key a value between `min` and `max`. Name it (`aria-label` or a `<label htmlFor>`), set `step`, and print the value beside it. */
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
