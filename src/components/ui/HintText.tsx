import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { focusRingClassName } from './controlStyles';
import { Tooltip } from './Tooltip';

interface HintTextProps {
  /** What the tooltip says. Same rules as `Tooltip`'s `content`. */
  content: ReactNode;
  children: ReactNode;
  /** Tone and type (`text-danger`, `tabular-nums`…). The dotted underline follows the text colour. */
  className?: string;
  /**
   * For a name that only truncates from `sm` up and whose tooltip repeats what
   * the phone card already shows in full: the cue and the tap-to-reveal both
   * apply from `sm` only. Without `openOnTap`, a tap on a table row still
   * opens the row (`DataTable` leaves taps on `openOnTap` triggers alone).
   */
  desktopOnly?: boolean;
  /**
   * For a name inside a truncating parent (`truncate`, `line-clamp`): the cue
   * and the tooltip appear only while the parent actually clips the text. A
   * name that fits in full has nothing left to reveal.
   */
  onlyWhenTruncated?: boolean;
}

/** Whether the element's parent clips its content, kept current as either resizes. */
function useParentClips(enabled: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [clips, setClips] = useState(false);
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!enabled || !parent) return;
    const measure = () => setClips(parent.scrollWidth > parent.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [enabled]);
  return { ref, clips };
}

/**
 * Text that carries a tooltip (DESIGN.md §6c): a dotted underline, dimmed to
 * about 70% so it reads as a cue and not as emphasis, visible at rest. A
 * focusable `<span>` so a keyboard reveals the bubble, and `openOnTap` so a
 * phone can too. The dotted underline means "has a tooltip" and nothing else;
 * a trigger that opens a popover on click is field chrome with a caret, not
 * this.
 */
export function HintText({
  content,
  children,
  className,
  desktopOnly = false,
  onlyWhenTruncated = false,
}: HintTextProps) {
  const { ref, clips } = useParentClips(onlyWhenTruncated);
  // Not clipped: a plain span, no tooltip. It stays mounted so the observer
  // keeps watching and the cue returns when the column narrows.
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
            : 'cursor-help underline decoration-dotted decoration-current/70 underline-offset-2',
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
