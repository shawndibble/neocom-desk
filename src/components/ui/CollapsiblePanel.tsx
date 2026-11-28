import type { ReactNode, Ref } from 'react';
import { useChangedSinceMount } from '@/lib/useChangedSinceMount';
import { CaretToggle } from './Disclosure';
import { Panel } from './Panel';

interface CollapsiblePanelProps {
  /** @summary Already-translated panel heading. */
  title: string;
  meta?: ReactNode;
  wrapMeta?: boolean;
  metaOwnRow?: boolean;
  actions?: ReactNode;
  /** @summary Whether the body is open; the caller owns this state. */
  expanded: boolean;
  /** @summary Called when the caret is pressed. */
  onToggle: () => void;
  labels?: { show: string; hide: string };
  padded?: boolean;
  collapsible?: boolean;
  collapsedSummary?: ReactNode;
  toggleRef?: Ref<HTMLButtonElement>;
  className?: string;
  children: ReactNode;
}

/** @summary A `Panel` whose body folds away behind a caret; the header keeps title, meta and actions. */
export function CollapsiblePanel({
  title,
  meta,
  wrapMeta,
  metaOwnRow,
  actions,
  expanded,
  onToggle,
  labels,
  padded = true,
  collapsible = true,
  collapsedSummary,
  toggleRef,
  className,
  children,
}: CollapsiblePanelProps) {
  const open = expanded || !collapsible;
  const toggled = useChangedSinceMount(open);
  const body = toggled ? <div className="motion-fade">{children}</div> : children;
  return (
    <Panel
      title={title}
      meta={meta}
      wrapMeta={wrapMeta}
      metaOwnRow={metaOwnRow}
      className={className}
      padded={padded}
      actions={actions}
      onHeaderToggle={collapsible ? onToggle : undefined}
      leading={
        collapsible && (
          <CaretToggle
            toggleRef={toggleRef}
            expanded={open}
            label={(open ? labels?.hide : labels?.show) ?? title}
            onClick={onToggle}
          />
        )
      }
    >
      {open ? body : collapsedSummary}
    </Panel>
  );
}
