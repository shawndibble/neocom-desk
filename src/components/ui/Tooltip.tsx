import { cloneElement, isValidElement, useId, type ReactElement } from 'react';

interface TooltipProps {
  /** One-line plain-language tooltip content. */
  content: string;
  /** Single focusable trigger element (button, etc.) — tooltip reveals on hover or focus. */
  children: ReactElement<{ 'aria-describedby'?: string }>;
}

/**
 * Accessible tooltip: reveals a `role="tooltip"` bubble on hover or focus of
 * its trigger child (CSS `:hover`/`:focus-within` on the wrapping span — no
 * JS state), and wires `aria-describedby` onto the trigger so screen readers
 * announce the content too — a `display:none` `role="tooltip"` node alone is
 * not announced by itself.
 */
export function Tooltip({ content, children }: TooltipProps) {
  const id = useId();
  const trigger = isValidElement(children)
    ? cloneElement(children, { 'aria-describedby': id })
    : children;
  return (
    <span className="group relative inline-flex">
      {trigger}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-56 -translate-x-1/2 rounded-xs border border-line bg-panel p-2 text-[11px] font-normal text-text-dim normal-case shadow-lg shadow-black/50 group-hover:block group-focus-within:block"
      >
        {content}
      </span>
    </span>
  );
}

interface InfoTooltipProps {
  /** Accessible name for the trigger button, e.g. "About Material Efficiency". */
  label: string;
  /** One-line plain-language tooltip content. */
  content: string;
  className?: string;
}

/** Small "?" icon button + Tooltip, for labeling jargon next to a heading/label that isn't itself focusable. */
export function InfoTooltip({ label, content, className = '' }: InfoTooltipProps) {
  return (
    <Tooltip content={content}>
      <button
        type="button"
        aria-label={label}
        className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-line text-[10px] leading-none text-text-dim hover:border-line-bright hover:text-text focus-visible:outline-2 focus-visible:outline-accent ${className}`}
      >
        ?
      </button>
    </Tooltip>
  );
}
