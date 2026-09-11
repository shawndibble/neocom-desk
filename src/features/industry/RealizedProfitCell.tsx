import { useState } from 'react';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { formatIsk } from '@/lib/isk';
import type { ProductionRunSummary } from './productionRunSummary';
import { RealizedProfitBreakdown } from './RealizedProfitBreakdown';

interface RealizedProfitCellProps<Row extends ProductionRunSummary> {
  row: Row;
  label: string;
  accountingLevel: number;
  brokerRelationsLevel: number;
}

/**
 * The realized-profit figure plus, once something has sold, a trigger that
 * opens `RealizedProfitBreakdown` for that row (issue #824) —
 * `quantitySold === 0` means `marginPct` is null and there is nothing
 * realized yet to explain, so the trigger is withheld rather than shown
 * disabled.
 */
export function RealizedProfitCell<Row extends ProductionRunSummary>({
  row,
  label,
  accountingLevel,
  brokerRelationsLevel,
}: RealizedProfitCellProps<Row>) {
  const [open, setOpen] = useState(false);
  const value = formatIsk(row.profit.profit);

  if (row.quantitySold === 0) return value;

  return (
    <span className="inline-flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      {value}
      <IconButton
        size="sm"
        variant="plain"
        icon={<Icon.Info />}
        label={label}
        onClick={() => setOpen(true)}
      />
      <RealizedProfitBreakdown
        open={open}
        onClose={() => setOpen(false)}
        profit={row.profit}
        accountingLevel={accountingLevel}
        brokerRelationsLevel={brokerRelationsLevel}
      />
    </span>
  );
}
