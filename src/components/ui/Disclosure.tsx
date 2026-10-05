import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { focusRingClassName, focusRingInsetClassName, interactiveClassName } from './controlStyles';
import * as Icon from './icons';

interface DisclosureProps {
  /** Always-visible label, left of the chevron toggle. */
  label: ReactNode;
  /**
   * Interactive extra beside the label, e.g. an `InfoTooltip`. Sits outside
   * the toggle button (a button can't nest one), so its clicks don't toggle.
   */
  labelAccessory?: ReactNode;
  /** Always-visible value, right-aligned in the toggle row. */
  trailing?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Rendered only while expanded. */
  children: ReactNode;
  className?: string;
}

/**
 * The open/closed caret shared by every disclosure surface in the app —
 * `Disclosure` itself, the Skills group headers, the Market Group tree and
 * the Fittings Charges tab's module sections, which each own too much of
 * their own frame to reuse the component but must still point the same way
 * with the same glyph.
 */
export function Caret({ expanded }: { expanded: boolean }) {
  const Glyph = expanded ? Icon.Expanded : Icon.Descend;
  return <Glyph size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0 text-text-faint" />;
}

/**
 * ARIA-disclosure row: a button toggling `aria-expanded` with content
 * revealed beneath it. Caller owns the expanded state so it can be driven
 * externally (e.g. "expand all").
 */
export function Disclosure({
  label,
  labelAccessory,
  trailing,
  expanded,
  onToggle,
  children,
  className = '',
}: DisclosureProps) {
  const labelContent = (
    <span className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
      <Caret expanded={expanded} />
      {label}
    </span>
  );
  const trailingContent = trailing !== undefined && (
    <span className="text-[0.6875rem] font-medium tabular-nums text-text">{trailing}</span>
  );
  const body = expanded && (
    <div className="divide-y divide-line border-t border-line bg-panel-2">{children}</div>
  );

  if (labelAccessory !== undefined) {
    // The row itself toggles so the whole width stays a click target; the
    // button bubbles its click (and keyboard activation) up to it.
    return (
      <div className={className}>
        <div
          onClick={onToggle}
          className={cx(
            'flex min-h-11 w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 hover:bg-panel-2 active:bg-panel md:min-h-0',
            interactiveClassName
          )}
        >
          <button
            type="button"
            aria-expanded={expanded}
            className={cx('text-left', focusRingClassName)}
          >
            {labelContent}
            {/* The value sits outside the button for layout; keep it in the
                button's name so the toggle still announces it. */}
            {trailing !== undefined && <span className="sr-only">{trailing}</span>}
          </button>
          <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
            {labelAccessory}
          </span>
          <span className="ml-auto" aria-hidden="true">
            {trailingContent}
          </span>
        </div>
        {body}
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={cx(
          'flex min-h-11 w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-panel-2 active:bg-panel md:min-h-0',
          interactiveClassName,
          focusRingInsetClassName
        )}
      >
        {labelContent}
        {trailingContent}
      </button>
      {body}
    </div>
  );
}
