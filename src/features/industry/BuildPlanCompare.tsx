/**
 * Compare mode (issue #453): 2+ selected Build Plans, each priced against its
 * own blueprint/ME/TE/facility/hub — never the currently-open plan's
 * snapshot — side by side in one table. Mounted by `Industry.tsx` in place of
 * `BuildPlanDetail` while compare mode is active; `onDone` restores whichever
 * plan was open before compare mode started (CONTEXT.md round 25's two-pane
 * idiom: this is a state of the detail pane, not a separate route).
 */
import { useTranslation } from 'react-i18next';
import { Button, DataTable, InfoTooltip, Panel } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import type { BuildPlanRecord } from '@/db';
import type { SkillLevels } from '@/engine/industry/types';
import type { PiData } from '@/sde/types';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { iskToneClass } from '@/features/character/format';
import type { BlueprintCatalog } from './blueprintCatalog';
import { formatPercent } from './format';
import { useComparedBuildResults, type ComparedBuildRow } from './useComparedBuildResults';

interface BuildPlanCompareProps {
  plans: readonly BuildPlanRecord[];
  catalog: BlueprintCatalog;
  pi: PiData | null;
  skills: SkillLevels;
  /** Exits compare mode, restoring the previously open single-plan detail. */
  onDone: () => void;
}

/** A numeric cell: "…" while its row is still fetching, else the formatted value or "—" when unresolved (row.error) or unpriceable (BuildResult's own null). */
function numericCell(
  row: ComparedBuildRow,
  value: number | null | undefined,
  format: (v: number) => string,
  unknown: string
): string {
  if (row.loading) return '…';
  if (value === null || value === undefined) return unknown;
  return format(value);
}

export function BuildPlanCompare({ plans, catalog, pi, skills, onDone }: BuildPlanCompareProps) {
  const { t } = useTranslation();
  const rows = useComparedBuildResults({ plans, catalog, pi, skills });
  const unknown = t('common.unknown');

  const columns: DataTableColumn<ComparedBuildRow>[] = [
    {
      id: 'plan',
      header: t('industry.comparePlanColumn'),
      primary: true,
      sortValue: (row) => row.planName,
      render: (row) => (
        <span className="flex items-center gap-1.5">
          {row.planName}
          {!row.loading && row.error && (
            <InfoTooltip
              label={t('industry.compareUnresolvedFor', { plan: row.planName })}
              content={row.error}
            />
          )}
        </span>
      ),
    },
    {
      id: 'product',
      header: t('industry.product'),
      sortValue: (row) => row.productName,
      render: (row) => row.productName,
    },
    {
      id: 'runs',
      header: t('industry.runs'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.runs,
      render: (row) => row.runs,
    },
    {
      id: 'duration',
      header: t('industry.time'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.seconds ?? undefined,
      render: (row) => numericCell(row, row.result?.seconds ?? null, formatDuration, unknown),
    },
    {
      id: 'totalCost',
      header: t('industry.totalCost'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.totalCost ?? undefined,
      render: (row) =>
        numericCell(row, row.result?.totalCost ?? null, (v) => formatIsk(v), unknown),
    },
    {
      id: 'profit',
      header: t('industry.profit'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.profit ?? undefined,
      cellClassName: (row) =>
        row.result?.profit != null ? iskToneClass(row.result.profit) : undefined,
      render: (row) => numericCell(row, row.result?.profit ?? null, (v) => formatIsk(v), unknown),
    },
    {
      id: 'margin',
      header: t('industry.margin'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.marginPct ?? undefined,
      render: (row) => numericCell(row, row.result?.marginPct ?? null, formatPercent, unknown),
    },
    {
      id: 'iskPerHour',
      header: t('industry.iskPerHour'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.iskPerHour ?? undefined,
      render: (row) =>
        numericCell(row, row.result?.iskPerHour ?? null, (v) => formatIsk(v), unknown),
    },
    {
      id: 'breakEvenPrice',
      header: t('industry.breakEvenPrice'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.breakEvenPrice ?? undefined,
      render: (row) =>
        numericCell(row, row.result?.breakEvenPrice ?? null, (v) => formatIsk(v), unknown),
    },
  ];

  return (
    <Panel
      title={t('industry.compareTitle')}
      actions={
        <Button size="sm" onClick={onDone}>
          {t('industry.compareDone')}
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.planId}
          label={t('industry.compareTableLabel')}
          defaultSort={{ columnId: 'plan', direction: 'asc' }}
        />
      </div>
    </Panel>
  );
}
