import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { useDescribedBy } from './fieldNote';
import { isApplePlatform, isModChord } from '@/lib/shortcuts';
import { fieldBaseClassName, focusRingInsetClassName } from './controlStyles';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Monospace face, for pasted EFT fits and appraisal lists. */
  mono?: boolean;
  /**
   * Embedded in a frame the caller already draws (the mail editor's card): no
   * border, radius, fill or padding of its own, and the focus ring is drawn
   * inside the box so it never lands on the frame's hairline.
   */
  bare?: boolean;
  /**
   * Ctrl+Enter (Cmd+Enter on Apple) in the box runs this — the way GitHub,
   * Slack and Gmail submit a multi-line field. The caller owns the guard
   * (empty text, already busy); the key only asks.
   */
  onSubmitChord?: () => void;
}

/**
 * A multi-line field with the house treatment.
 *
 * Owns only the chrome (fill, ring, radius, full width, padding) so the next
 * textarea can't forget it. Font size, rows, placeholder and label wiring stay
 * with the caller — the paste boxes deliberately differ in density.
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  {
    mono = false,
    bare = false,
    className = '',
    onSubmitChord,
    onKeyDown,
    'aria-describedby': describedBy,
    ...rest
  },
  ref
) {
  const described = useDescribedBy(describedBy);
  return (
    <textarea
      ref={ref}
      className={cx(
        bare
          ? cx('w-full bg-transparent outline-none disabled:opacity-40', focusRingInsetClassName)
          : cx(fieldBaseClassName, 'w-full p-2'),
        mono && 'font-mono',
        className
      )}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || !onSubmitChord) return;
        if (!isModChord(event, isApplePlatform(), 'Enter')) return;
        event.preventDefault();
        onSubmitChord();
      }}
      {...rest}
      aria-describedby={described}
    />
  );
});
