import { useState } from 'react';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { SKILL_IDS, type SkillLevels } from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';
import { formatIsk } from '@/lib/isk';
import type { ProductionRunSummary } from './productionRunSummary';
import { RealizedProfitBreakdown } from './RealizedProfitBreakdown';

interface RealizedProfitCellProps {
  row: ProductionRunSummary;
  label: string;
  skills: SkillLevels;
  /** The standing the row's own `profit` was already computed with (issue #1238) — for the breakdown's display only. */
  standing?: ResolvedStandings;
}

/**
 * The realized-profit figure plus, once something has sold, a trigger that
 * opens `RealizedProfitBreakdown` for that row (issue #824) —
 * `quantitySold === 0` means `grossRevenue` is also 0 and `marginPct` is
 * null, so there is nothing realized yet to explain and the trigger is
 * withheld rather than shown disabled.
 */
export function RealizedProfitCell({ row, label, skills, standing }: RealizedProfitCellProps) {
  const [open, setOpen] = useState(false);
  const value = formatIsk(row.profit.profit);

  if (row.quantitySold === 0) return value;

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
      />
    </span>
  );
}
