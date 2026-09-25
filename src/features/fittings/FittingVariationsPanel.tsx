/** Renders `useModuleVariations`' rows; clicking one swaps it in. One `DataTable` — its own stacked layout below `sm` is the mobile card view. */
import { useTranslation } from 'react-i18next';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { IskAmount, TypeIcon } from '@/components/ui';
import { type StatChange, STAT_DIGITS } from '@/engine/fittings/variationDelta';
import type { VariationRow } from './useModuleVariations';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function formatDelta(change: StatChange): number {
  const digits = STAT_DIGITS[change.key];
  const factor = 10 ** digits;
  return Math.round((change.after - change.before) * factor) / factor;
}

function changeLabel(change: StatChange, t: Translate): string {
  if (change.key === 'capacitor') {
    return change.after >= 0
      ? t('fittings.variations.stat.capacitorStable', { pct: change.after.toFixed(0) })
      : t('fittings.variations.stat.capacitorUnstable', {
          seconds: (-change.after).toFixed(0),
        });
  }
  const delta = formatDelta(change);
  const value = delta > 0 ? `+${delta}` : `${delta}`;
  return t(`fittings.variations.stat.${change.key}`, { value });
}

function ChangesCell({ row, t }: { row: VariationRow; t: Translate }) {
  if (row.delta === null) return <span className="text-text-dim">{t('common.loading')}</span>;
  if (row.delta.count === 0)
    return <span className="text-text-dim">{t('fittings.variations.noChanges')}</span>;
  return (
    <div className="space-y-0.5">
      <p className="text-text-dim">
        {t('fittings.variations.changedCount', { count: row.delta.count })}
      </p>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {row.delta.changes.map((change) => (
          <span key={change.key}>{changeLabel(change, t)}</span>
        ))}
      </div>
    </div>
  );
}

function BoolCell({
  value,
  yes,
  no,
  loading,
}: {
  value: boolean | null;
  yes: string;
  no: string;
  loading: string;
}) {
  if (value === null) return <span className="text-text-dim">{loading}</span>;
  return <span className={value ? 'text-success' : 'text-danger'}>{value ? yes : no}</span>;
}

export interface FittingVariationsPanelProps {
  rows: readonly VariationRow[];
  onSelect: (typeId: number) => void;
}

export function FittingVariationsPanel({ rows, onSelect }: FittingVariationsPanelProps) {
  const { t } = useTranslation();

  if (rows.length === 0)
    return <p className="text-xs text-text-dim">{t('fittings.variations.none')}</p>;

  const columns: DataTableColumn<VariationRow>[] = [
    {
      id: 'name',
      header: t('fittings.variations.name'),
      primary: true,
      sortValue: (row) => row.name,
      render: (row) => (
        <span className="flex items-center gap-1.5 font-medium">
          <TypeIcon typeId={row.typeId} size={32} className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{row.name}</span>
          <span className="shrink-0 text-[0.6875rem] text-text-dim">{row.metaGroupName}</span>
        </span>
      ),
    },
    {
      id: 'changes',
      header: t('fittings.variations.changes'),
      className: 'text-xs',
      render: (row) => <ChangesCell row={row} t={t} />,
    },
    {
      id: 'fits',
      header: t('fittings.variations.fits'),
      // Still loading (null) sinks to the end rather than sorting as false.
      sortValue: (row) => (row.fits === null ? undefined : row.fits ? 1 : 0),
      render: (row) => (
        <BoolCell
          value={row.fits}
          yes={t('fittings.variations.fitsYes')}
          no={
            row.overage
              ? t('fittings.variations.stillOverBy', {
                  amount: row.overage.amount.toFixed(1),
                  resource: t(`fittings.list.${row.overage.resource}`),
                })
              : t('fittings.variations.fitsNo')
          }
          loading={t('common.loading')}
        />
      ),
    },
    {
      id: 'canFly',
      header: t('fittings.variations.canFly'),
      // Still loading (null) sinks to the end rather than sorting as false.
      sortValue: (row) => (row.canFly === null ? undefined : row.canFly ? 1 : 0),
      render: (row) => (
        <BoolCell
          value={row.canFly}
          yes={t('fittings.variations.canFlyYes')}
          no={t('fittings.variations.canFlyNo')}
          loading={t('common.loading')}
        />
      ),
    },
    {
      id: 'price',
      header: t('fittings.variations.price'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.price ?? undefined,
      render: (row) =>
        row.price === null ? (
          <span className="text-text-dim">{t('fittings.variations.priceUnknown')}</span>
        ) : (
          <IskAmount value={row.price} revealOn="longPress" />
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.typeId}
      label={t('fittings.variations.title')}
      density="compact"
      mobileSort
      onRowClick={(row) => onSelect(row.typeId)}
    />
  );
}
