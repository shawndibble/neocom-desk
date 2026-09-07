import type { ReactNode } from 'react';
import { Caret } from './Disclosure';
import { IconButton } from './IconButton';
import { Panel } from './Panel';

interface CollapsiblePanelProps {
  title: string;
  /** The one-line read shown beside the title whether open or closed. */
  meta?: ReactNode;
  /** Header controls other than the caret; always visible. */
  actions?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Accessible names for the caret in each state. */
  labels: { show: string; hide: string };
  /** Set false for flush content like tables. */
  padded?: boolean;
  /**
   * False when there is nothing worth folding — an empty state, a single
   * line — so the caret is not offered and the body always shows. The
   * caller keeps its `expanded` state either way; this only overrides it.
   */
  collapsible?: boolean;
  /**
   * Shown in the body in place of `children` while folded. For a panel whose
   * detail is worth hiding but whose headline is not — the few figures that
   * say whether the detail is worth opening at all.
   *
   * Deliberately the body rather than `meta`: a summary of more than a couple
   * of values crowds the title it sits beside and wraps under any action
   * buttons in the header, while the body is a full-width row already sized
   * for figures. `meta` stays the one-line read.
   */
  collapsedSummary?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * A `Panel` whose body can be folded away behind its header. The header
 * keeps the title, a `meta` summary and any `actions`, so a closed panel
 * still answers the question it exists for — the caret only decides
 * whether the detail underneath is on screen. `children` are not rendered
 * while closed: a folded table is not a hidden table, it is absent, so it
 * costs no layout and no live queries keep running for it.
 *
 * `collapsedSummary` is the exception, and the only thing a folded panel
 * renders in its body — a handful of figures standing in for the detail, so
 * the fold costs a reader the breakdown rather than the answer.
 */
export function CollapsiblePanel({
  title,
  meta,
  actions,
  expanded,
  onToggle,
  labels,
  padded = true,
  collapsible = true,
  collapsedSummary,
  className,
  children,
}: CollapsiblePanelProps) {
  const open = expanded || !collapsible;
  return (
    <Panel
      title={title}
      meta={meta}
      className={className}
      padded={padded}
      actions={
        <>
          {actions}
          {collapsible && (
            <IconButton
              size="sm"
              icon={<Caret expanded={open} />}
              label={open ? labels.hide : labels.show}
              aria-expanded={open}
              onClick={onToggle}
            />
          )}
        </>
      }
    >
      {open ? children : collapsedSummary}
    </Panel>
  );
}
