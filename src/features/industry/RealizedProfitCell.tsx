import { useState } from 'react';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { SKILL_IDS, type SkillLevels } from '@/engine/industry/types';
import { runLoss } from '@/engine/industry/realizedProfit';
import type { ResolvedStandings } from '@/engine/market/standings';
import { formatIsk } from '@/lib/isk';
import type { ProductionRunSummary } from './productionRunSummary';
import { RealizedProfitBreakdown } from './RealizedProfitBreakdown';

interface RealizedProfitCellProps {
  row: ProductionRunSummary;
  label: string;
  skills: SkillLevels;
  standing?: ResolvedStandings;
}

export function RealizedProfitCell({ row, label, skills, standing }: RealizedProfitCellProps) {
  const [open, setOpen] = useState(false);
  const value = formatIsk(row.profit.profit);

  if (row.quantitySold === 0 && row.quantityLost === 0) return value;

  return (
    <span className="inline-flex items-center gap-1">
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
        accountingLevel={skills[SKILL_IDS.accounting] ?? 0}
        brokerRelationsLevel={skills[SKILL_IDS.brokerRelations] ?? 0}
        standing={standing}
        netLoss={row.losses.reduce(
          (sum, l) =>
            sum +
            runLoss({
              totalCost: row.run.totalCost,
              quantity: row.run.quantity,
              quantityLost: l.quantity,
              insurancePayout: l.insurancePayout,
            }).netLoss,
          0
        )}
      />
    </span>
  );
}
