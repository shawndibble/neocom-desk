import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { fieldBaseClassName } from './controlStyles';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Monospace face, for pasted EFT fits and appraisal lists. */
  mono?: boolean;
}

/**
 * A multi-line field with the house treatment.
 *
 * Owns only the chrome (fill, ring, radius, full width, padding) so the next
 * textarea can't forget it. Font size, rows, placeholder and label wiring stay
 * with the caller — the paste boxes deliberately differ in density.
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { mono = false, className = '', ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cx(fieldBaseClassName, 'w-full p-2', mono && 'font-mono', className)}
      {...rest}
    />
  );
});
