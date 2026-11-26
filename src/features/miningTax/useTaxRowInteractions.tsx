import { useCallback, useState, type ReactElement } from 'react';
import { cx } from '@/lib/cx';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import { TaxRowMenu } from '@/features/miningTax/TaxRowMenu';
import type { TaxDialogActions } from '@/features/miningTax/useTaxDialogs';

export interface TaxRowProps {
  rowClassName: (dr: DisplayRow) => string;
  onRowClick: (dr: DisplayRow | null) => void;
  rowContextMenu: (dr: DisplayRow, tr: ReactElement) => ReactElement;
  rowMoreActions: true;
}

export function useTaxRowInteractions(
  systemName: (dr: DisplayRow) => string,
  actions: TaxDialogActions
) {
  const [expandedCombined, setExpandedCombined] = useState<ReadonlySet<string>>(new Set());

  const toggleCombinedExpanded = useCallback((key: string) => {
    setExpandedCombined((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const rowContextMenu = useCallback(
    (dr: DisplayRow, tr: ReactElement) => (
      <TaxRowMenu dr={dr} systemName={systemName(dr)} onAction={actions.runRowMenuAction}>
        {tr}
      </TaxRowMenu>
    ),
    [systemName, actions]
  );

  const rowClassName = (dr: DisplayRow) =>
    cx(
      dr.status === 'paid' && 'text-text-dim',
      expandedCombined.has(dr.key) && 'sm:[&>td]:align-top'
    );

  const rowProps: TaxRowProps = {
    rowClassName,
    onRowClick: actions.openDetail,
    rowContextMenu,
    rowMoreActions: true,
  };

  return { expandedCombined, toggleCombinedExpanded, rowProps };
}
