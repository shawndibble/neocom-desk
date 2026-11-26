import type { ReactNode, Ref } from 'react';
import { CaretToggle } from './Disclosure';
import { Panel } from './Panel';

interface CollapsiblePanelProps {
  title: string;
  meta?: ReactNode;
  wrapMeta?: boolean;
  metaOwnRow?: boolean;
  actions?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  labels?: { show: string; hide: string };
  padded?: boolean;
  collapsible?: boolean;
  collapsedSummary?: ReactNode;
  toggleRef?: Ref<HTMLButtonElement>;
  className?: string;
  children: ReactNode;
}

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
      {open ? children : collapsedSummary}
    </Panel>
  );
}
