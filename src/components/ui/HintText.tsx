import type { ReactNode } from 'react';
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
}

/**
 * Text that carries a tooltip (DESIGN.md §6c): a dotted underline, dimmed to
 * about 70% so it reads as a cue and not as emphasis, visible at rest. A
 * focusable `<span>` so a keyboard reveals the bubble, and `openOnTap` so a
 * phone can too. The dotted underline means "has a tooltip" and nothing else;
 * a trigger that opens a popover on click is field chrome with a caret, not
 * this.
 */
export function HintText({ content, children, className, desktopOnly = false }: HintTextProps) {
  return (
    <Tooltip content={content} openOnTap={!desktopOnly}>
      <span
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
