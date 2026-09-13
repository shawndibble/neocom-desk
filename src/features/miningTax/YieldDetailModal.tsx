/**
 * Mining Yield row detail: clicking a day's row on the Overview tab opens
 * what that day actually was — every ore type mined with its icon, units and
 * m³, what each line is worth sold raw against refined, what the whole day
 * refines into, and the two assumptions both numbers rest on.
 *
 * Deliberately NOT a reuse or generalization of the Tax tab's
 * `RowDetailModal`: that one is bound to the rent model (Assignment, Payee,
 * status) this tab has no concept of — same ledger, different question, see
 * `yieldGrouping.ts`'s note. The two share the visual vocabulary and nothing
 * else.
 *
 * Everything here is read-only. A Mining Yield row records what ESI reported;
 * there is nothing about it for a pilot to edit.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  InfoTooltip,
  Modal,
  StatChip,
  TypeIcon,
  IskAmount,
  type DataTableColumn,
} from '@/components/ui';
import { SecurityValue } from '@/features/character/assetBrowserRows';
import { formatVolume } from '@/features/market/format';
import type { OreLineValuation } from '@/engine/miningTax/yieldValuation';
import type { MiningYieldRow } from './yieldSnapshot';

interface YieldDetailModalProps {
  open: boolean;
  onClose: () => void;
  row: MiningYieldRow;
  systemName: string;
  /** Undefined while still resolving, null when unresolvable — `SecurityValue` renders nothing either way. */
  systemSecurity: number | null | undefined;
  typeNames: ReadonlyMap<number, string>;
  /** m³ per unit, by type. A type the SDE bake doesn't carry renders as an em dash rather than a zero. */
  typeVolumes: ReadonlyMap<number, number>;
}

interface RefinedRow {
  typeId: number;
  quantity: number;
  /** Null when ESI had no mined-date history for this material — never a zero standing in for "free". */
  value: number | null;
}

export function YieldDetailModal({
  open,
  onClose,
  row,
  systemName,
  systemSecurity,
  typeNames,
  typeVolumes,
}: YieldDetailModalProps) {
  const { t } = useTranslation();
  const { valuation, entry } = row;

  const typeName = (typeId: number) => typeNames.get(typeId) ?? `#${typeId}`;
  const lineVolume = (line: OreLineValuation): number | null => {
    const unit = typeVolumes.get(line.typeId);
    return unit === undefined ? null : unit * line.quantity;
  };

  const totals = useMemo(() => {
    let units = 0;
    let volume = 0;
    let volumeComplete = true;
    let unitsLeftOver = 0;
    for (const line of valuation.lines) {
      units += line.quantity;
      const lineM3 = typeVolumes.get(line.typeId);
      if (lineM3 === undefined) volumeComplete = false;
      else volume += lineM3 * line.quantity;
      unitsLeftOver += line.unitsLeftOver;
    }
    const delta = valuation.refineValue - valuation.rawValue;
    return {
      units,
      volume,
      volumeComplete,
      unitsLeftOver,
      delta,
      deltaPercent: valuation.rawValue > 0 ? (delta / valuation.rawValue) * 100 : null,
    };
  }, [valuation, typeVolumes]);

  /** Every line's refining output folded into one per-material list, most valuable first. */
  const refinedRows: RefinedRow[] = useMemo(() => {
    const byType = new Map<number, number>();
    for (const line of valuation.lines) {
      for (const output of line.refineOutputs) {
        byType.set(output.typeId, (byType.get(output.typeId) ?? 0) + output.quantity);
      }
    }
    return [...byType.entries()]
      .map(([typeId, quantity]): RefinedRow => {
        const price = row.materialUnitPrices.get(typeId);
        return { typeId, quantity, value: price === undefined ? null : price * quantity };
      })
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || b.quantity - a.quantity);
  }, [valuation, row.materialUnitPrices]);

  const oreColumns: DataTableColumn<OreLineValuation>[] = [
    {
      id: 'type',
      header: t('miningTax.oreColumn'),
      primary: true,
      render: (line) => (
        <span className="flex items-center gap-1.5">
          <TypeIcon typeId={line.typeId} size={32} className="h-5 w-5 shrink-0" />
          <span className="truncate">{typeName(line.typeId)}</span>
        </span>
      ),
      sortValue: (line) => typeName(line.typeId),
    },
    {
      id: 'units',
      header: t('miningTax.overview.detail.unitsColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (line) => line.quantity.toLocaleString(),
      sortValue: (line) => line.quantity,
    },
    {
      id: 'volume',
      header: t('miningTax.overview.detail.m3Column'),
      align: 'right',
      className: 'whitespace-nowrap text-text-dim tabular-nums',
      render: (line) => {
        const volume = lineVolume(line);
        return volume === null ? '—' : formatVolume(volume);
      },
      sortValue: (line) => lineVolume(line) ?? undefined,
    },
    {
      id: 'raw',
      header: t('miningTax.overview.rawSellValue'),
      align: 'right',
      className: 'whitespace-nowrap',
      // A line with no mined-date price has a zero `rawValue` that means
      // "unpriced", not "worthless" — an em dash says so, "0 ISK" would not.
      render: (line) =>
        line.rawValue > 0 ? <IskAmount value={line.rawValue} revealOn="tap" decimals={0} /> : '—',
      sortValue: (line) => line.rawValue,
    },
    {
      id: 'refined',
      header: t('miningTax.overview.refineValue'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (line) =>
        line.refineValue > 0 ? (
          <IskAmount value={line.refineValue} revealOn="tap" decimals={0} />
        ) : (
          '—'
        ),
      sortValue: (line) => line.refineValue,
    },
  ];

  const refinedColumns: DataTableColumn<RefinedRow>[] = [
    {
      id: 'material',
      header: t('miningTax.overview.detail.materialColumn'),
      primary: true,
      render: (material) => (
        <span className="flex items-center gap-1.5">
          <TypeIcon typeId={material.typeId} size={32} className="h-5 w-5 shrink-0" />
          <span className="truncate">{typeName(material.typeId)}</span>
        </span>
      ),
      sortValue: (material) => typeName(material.typeId),
    },
    {
      id: 'quantity',
      header: t('miningTax.overview.detail.unitsColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (material) => material.quantity.toLocaleString(),
      sortValue: (material) => material.quantity,
    },
    {
      id: 'value',
      header: t('miningTax.overview.detail.valueColumn'),
      align: 'right',
      className: 'whitespace-nowrap text-text-dim',
      render: (material) =>
        material.value === null ? (
          '—'
        ) : (
          <IskAmount value={material.value} revealOn="tap" decimals={0} />
        ),
      sortValue: (material) => material.value ?? undefined,
    },
  ];

  const refineWins = totals.delta > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="wide"
      title={
        <span className="flex items-center gap-1.5">
          {t('miningTax.overview.detail.title', { date: entry.date, system: systemName })}
          <SecurityValue security={systemSecurity} t={t} />
          <InfoTooltip
            label={t('common.aboutLabel', { label: t('miningTax.dateColumn') })}
            content={t('miningTax.dateEveHint')}
          />
        </span>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="text-text-dim">{row.characterName}</span>
          <div className="flex flex-wrap gap-2">
            <StatChip
              label={t('miningTax.overview.volumeStat')}
              value={totals.volumeComplete ? `${formatVolume(totals.volume)} m³` : '—'}
            />
            <StatChip
              label={t('miningTax.overview.detail.unitsColumn')}
              value={totals.units.toLocaleString()}
            />
            <StatChip
              label={t('miningTax.overview.detail.oreTypesStat')}
              value={valuation.lines.length.toLocaleString()}
            />
          </div>
        </div>

        {/* The whole point of the row: which exit was worth more, and by how
            much. Raw and refined sit side by side so neither reads as the
            headline number on its own. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xs border border-line bg-panel-2 p-2.5">
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('miningTax.overview.detail.sellRawCard')}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              <IskAmount value={valuation.rawValue} revealOn="tap" decimals={0} />
            </p>
          </div>
          <div className="rounded-xs border border-line bg-panel-2 p-2.5">
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('miningTax.overview.detail.refineCard')}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              <IskAmount value={valuation.refineValue} revealOn="tap" decimals={0} />
            </p>
          </div>
          <div className="rounded-xs border border-line bg-panel-2 p-2.5">
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {refineWins
                ? t('miningTax.overview.detail.refineGainCard')
                : t('miningTax.overview.detail.refineLossCard')}
            </p>
            <p
              className={`mt-1 text-lg font-semibold tabular-nums ${refineWins ? 'text-isk-pos' : 'text-text'}`}
            >
              <IskAmount value={Math.abs(totals.delta)} revealOn="tap" decimals={0} />
            </p>
            {totals.deltaPercent !== null && (
              <p className="text-[0.6875rem] text-text-dim tabular-nums">
                {t('miningTax.overview.detail.deltaPercent', {
                  percent: Math.abs(totals.deltaPercent).toFixed(1),
                })}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="overflow-hidden rounded-xs border border-line">
            <p className="border-b border-line bg-panel-2 px-2.5 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('miningTax.overview.detail.oreMinedTitle')}
            </p>
            <DataTable
              columns={oreColumns}
              rows={valuation.lines}
              rowKey={(line) => line.typeId}
              label={t('miningTax.overview.detail.oreMinedTitle')}
              defaultSort={{ columnId: 'raw', direction: 'desc' }}
            />
          </div>

          <div className="space-y-3">
            <div className="overflow-hidden rounded-xs border border-line">
              <p className="border-b border-line bg-panel-2 px-2.5 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.overview.detail.refinesIntoTitle')}
              </p>
              {refinedRows.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-text-dim">
                  {t('miningTax.overview.detail.refinesIntoNone')}
                </p>
              ) : (
                <DataTable
                  columns={refinedColumns}
                  rows={refinedRows}
                  rowKey={(material) => material.typeId}
                  label={t('miningTax.overview.detail.refinesIntoTitle')}
                />
              )}
              {/* The portion trap, stated rather than rounded away:
                  `reprocessing.ts` returns nothing at all for a part batch. */}
              {totals.unitsLeftOver > 0 && (
                <p className="border-t border-line px-2.5 py-1.5 text-[0.6875rem] text-warning">
                  {t('miningTax.overview.detail.leftOverHint', {
                    units: totals.unitsLeftOver.toLocaleString(),
                  })}
                </p>
              )}
            </div>

            <div className="overflow-hidden rounded-xs border border-line">
              <p className="border-b border-line bg-panel-2 px-2.5 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.overview.detail.pricingTitle')}
              </p>
              <div className="space-y-1.5 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-text-dim">
                <p>{t('miningTax.overview.detail.priceBasisHint', { date: entry.date })}</p>
                <p>
                  {t('miningTax.overview.detail.refineBasisHint', {
                    character: row.characterName,
                    efficiency: (valuation.efficiency * 100).toFixed(1),
                  })}
                </p>
                {!valuation.pricedAll && (
                  <p className="text-warning">
                    {t('miningTax.overview.detail.partialPricingHint')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
