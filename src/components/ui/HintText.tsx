import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { focusRingClassName, hintCueClassName } from './controlStyles';
import { Tooltip } from './Tooltip';

interface HintTextProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  desktopOnly?: boolean;
  onlyWhenTruncated?: boolean;
}

function useParentClips(enabled: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [clips, setClips] = useState(false);
  const measure = () => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const style = getComputedStyle(parent);
    const limit =
      parent.getBoundingClientRect().right -
      (parseFloat(style.paddingRight) || 0) -
      (parseFloat(style.borderRightWidth) || 0);
    setClips(el.getBoundingClientRect().right > limit + 0.5);
  };
  useLayoutEffect(() => {
    if (enabled) measure();
  });
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!enabled || !parent) return;
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [enabled]);
  return { ref, clips: enabled && clips };
}

export function HintText({
  content,
  children,
  className,
  desktopOnly = false,
  onlyWhenTruncated = false,
}: HintTextProps) {
  const { ref, clips } = useParentClips(onlyWhenTruncated);
  if (onlyWhenTruncated && !clips) {
    return (
      <span ref={ref} className={className}>
        {children}
      </span>
    );
  }
  return (
    <Tooltip content={content} openOnTap={!desktopOnly}>
      <span
        ref={ref}
        tabIndex={0}
        className={cx(
          desktopOnly
            ? 'sm:cursor-help sm:underline sm:decoration-dotted sm:decoration-current/70 sm:underline-offset-2'
            : cx('cursor-help', hintCueClassName),
          'rounded-xs',
          focusRingClassName,
          className
        )}
      >
        {children}
      </span>
    </Tooltip>
  );
}
