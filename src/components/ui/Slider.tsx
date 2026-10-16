import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { disabledClassName, focusRingClassName, interactiveClassName } from './controlStyles';
import { useDescribedBy } from './fieldNote';

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /**
   * What a screen reader hears for the value (`aria-valuetext`): the figure
   * the pilot reads beside it ("10.5 km, 63% roll"), not the raw number the
   * track runs on.
   */
  valueText?: string;
}

/**
 * @summary A native range input in the house recipe: drag, click or arrow-key a value between `min` and `max`. Name it (`aria-label` or a `<label htmlFor>`), set `step`, and print the value beside it.
 *
 * The app's one slider. A native `<input type="range">` keeps the platform's
 * `slider` role, arrow / Page / Home / End keys and touch dragging; this adds
 * the accent colour, the shared focus ring, the disabled look, and the 44px
 * touch tier (below `md`, or on a coarse pointer). The track is drawn by the
 * browser inside that height, so the hit area is the control itself.
 *
 * Always set `step` to something a key press can see: on a 0.85–1.2 range
 * the default step of 1 moves nothing. The value is never the only readout —
 * print it beside the slider and pass the same text as `valueText`.
 */
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
        'h-11 w-full min-w-0 cursor-pointer accent-accent md:h-6 touch:h-11',
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
