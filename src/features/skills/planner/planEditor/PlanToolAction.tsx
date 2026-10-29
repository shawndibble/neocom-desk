import type { ReactNode } from 'react';
import { Button, Tooltip } from '@/components/ui';

/**
 * One action in the tools pane: a full-width row, glyph left, label beside
 * it. `size="md"` is deliberate — these are the pane's primary targets, so
 * they take the `h-9` touch tier (DESIGN.md §3) rather than `sm`,
 * which is for controls nested inside an already-dense row and would hand
 * a phone a 36px target.
 *
 * This replaces #224's two renderings of every action (full-text `Button`
 * at `lg`+, icon-only `IconButton` below it). That split existed because
 * centred pills wrapped badly in a wide row; stacked in a narrow column
 * the problem is gone, and a labelled row is self-describing where an
 * icon-only strip that scrolled sideways was not.
 */
export function PlanToolAction({
  icon,
  label,
  onClick,
  disabled,
  tooltip,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tooltip?: string;
}) {
  const button = (
    <Button size="md" align="start" className="w-full" onClick={onClick} disabled={disabled}>
      {/* Decorative: the label beside it is the accessible name (DESIGN.md §5). */}
      <span aria-hidden="true" className="shrink-0 text-text-dim">
        {icon}
      </span>
      {label}
    </Button>
  );
  return tooltip ? <Tooltip content={tooltip}>{button}</Tooltip> : button;
}
