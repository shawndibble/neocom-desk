import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { useDescribedBy } from './fieldNote';
import { isApplePlatform, isModChord } from '@/lib/shortcuts';
import { fieldBaseClassName, focusRingInsetClassName } from './controlStyles';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
  bare?: boolean;
  onSubmitChord?: () => void;
}

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
