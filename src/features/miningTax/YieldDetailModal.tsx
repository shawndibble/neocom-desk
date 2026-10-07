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
import { OreIcon } from './OreIcon';
import { useOreFormTypeId } from './oreForm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import {
  DataTable,
  InfoTooltip,
  Modal,
  StatChip,
  StatChips,
  IskAmount,
  type DataTableColumn,
} from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { CharacterLink, SystemLink } from '@/features/entities';
import { SecurityValue } from '@/features/character/assetBrowserRows';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import type { OreLineValuation } from '@/engine/miningTax/yieldValuation';
import type { MiningYieldRow } from './yieldSnapshot';
import { sumVolume } from './volume';
import { VolumeDisplay } from './volumeDisplay';
import {
  yieldOreCsvColumns,
  yieldRefinesCsvColumns,
  type YieldRefinedRow as RefinedRow,
} from './yieldCsv';

interface YieldDetailModalProps {
  open: boolean;
  onClose: () => void;
  row: MiningYieldRow;
  systemName: string;
  /** Undefined while still resolving, null when unresolvable — `SecurityValue` renders nothing either way. */
  systemSecurity: number | null | undefined;
  typeNames: ReadonlyMap<number, string>;
  /** m³ per unit, by type. A type with no known volume (issue #1283) is simply absent. */
  typeVolumes: ReadonlyMap<number, number>;
  /** Issue #1281's page switch — hides the refined-output section entirely. */
  showRefining: boolean;
}

const CARD = 'rounded-xs border bg-panel-2 p-2.5';
/** Marks the exit worth more — a recommendation, not decoration, so accent is
 *  in bounds per DESIGN.md §6. Same treatment as `BuildGroupPanel`'s best row. */
const CARD_SUGGESTED = 'border-accent-dim bg-accent/5';
const CARD_LABEL = 'text-[0.6875rem] font-semibold tracking-widest uppercase';
const CARD_HINT = 'mt-0.5 text-[0.6875rem] text-text-dim';
/**
 * A table's title strip: the title, with that table's export button at the right.
 * The menu's negative margin keeps the strip the height of the plain
 * "How this is priced" one, with or without a menu in it.
 */
const TABLE_TITLE =
  'flex items-center justify-between gap-2 border-b border-line bg-panel-2 py-1.5 pr-1 pl-2.5';
const TABLE_TITLE_TEXT = 'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';
const TABLE_TITLE_MENU = '-my-1.5 flex';

/**
 * Which exit this line was worth more through, or null when the two tie or
 * neither priced — a day with no market history must not green an em dash.
 */
function lineWinner(line: OreLineValuation): 'raw' | 'refined' | null {
  if (line.rawValue <= 0 && line.refineValue <= 0) return null;
  if (line.refineValue > line.rawValue) return 'refined';
  if (line.rawValue > line.refineValue) return 'raw';
  return null;
}

export function YieldDetailModal({
  open,
  onClose,
  row,
  systemName,
  systemSecurity,
  typeNames,
  typeVolumes,
  showRefining,
}: YieldDetailModalProps) {
  const { t } = useTranslation();
  const { valuation, entry } = row;

  const shownAs = useOreFormTypeId();
  const typeName = (typeId: number) => typeNames.get(typeId) ?? `#${typeId}`;

  const typeNameCell = (typeId: number) => (
    <span className="flex items-center gap-1.5">
      <OreIcon typeId={typeId} size={32} className="h-5 w-5 shrink-0" />
      <span className="truncate">
        <MarketItemLink typeId={shownAs(typeId)}>{typeName(typeId)}</MarketItemLink>
      </span>
    </span>
  );

  const totals = useMemo(() => {
    let units = 0;
    let unitsLeftOver = 0;
    for (const line of valuation.lines) {
      units += line.quantity;
      unitsLeftOver += line.unitsLeftOver;
    }
    const volume = sumVolume(
      valuation.lines,
      (line) => line.typeId,
      (line) => line.quantity,
      typeVolumes
    );
    const delta = valuation.refineValue - valuation.rawValue;
    return {
      units,
      volume,
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

  const oreCsvColumns = useMemo(
    () => yieldOreCsvColumns(t, typeNames, typeVolumes, showRefining),
    [t, typeNames, typeVolumes, showRefining]
  );
  const oreExport = useTableExport({
    surface: 'mining-yield-ores',
    rows: valuation.lines,
    columns: oreCsvColumns,
    qualifier: entry.date,
  });
  const refinesCsvColumns = useMemo(() => yieldRefinesCsvColumns(t, typeNames), [t, typeNames]);
  const refinesExport = useTableExport({
    surface: 'mining-yield-refines',
    rows: refinedRows,
    columns: refinesCsvColumns,
    qualifier: entry.date,
  });

  const oreColumns: DataTableColumn<OreLineValuation>[] = [
    {
      id: 'type',
      header: t('miningTax.oreColumn'),
      stickyStart: true,
      render: (line) => typeNameCell(line.typeId),
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
      phoneHidden: true,
      align: 'right',
      className: 'whitespace-nowrap text-text-dim tabular-nums',
      render: (line) => {
        const volume = sumVolume(
          [line],
          (l) => l.typeId,
          (l) => l.quantity,
          typeVolumes
        );
        return <VolumeDisplay volume={volume} typeNames={typeNames} t={t} />;
      },
      sortValue: (line) => {
        const unit = typeVolumes.get(line.typeId);
        return unit === undefined ? 0 : unit * line.quantity;
      },
    },
    {
      id: 'raw',
      header: t('miningTax.overview.rawSellValue'),
      align: 'right',
      className: 'whitespace-nowrap',
      // A line with no mined-date price has a zero `rawValue` that means
      // "unpriced", not "worthless" — an em dash says so, "0 ISK" would not.
      render: (line) =>
        line.rawValue > 0 ? (
          <IskAmount
            value={line.rawValue}
            decimals={0}
            className={lineWinner(line) === 'raw' ? 'text-isk-pos' : undefined}
          />
        ) : (
          '—'
        ),
      sortValue: (line) => line.rawValue,
    },
    ...(showRefining
      ? [
          {
            id: 'refined',
            header: t('miningTax.overview.refineValue'),
            align: 'right',
            className: 'whitespace-nowrap',
            render: (line) =>
              line.refineValue > 0 ? (
                <IskAmount
                  value={line.refineValue}
                  decimals={0}
                  className={lineWinner(line) === 'refined' ? 'text-isk-pos' : undefined}
                />
              ) : (
                '—'
              ),
            sortValue: (line) => line.refineValue,
          } satisfies DataTableColumn<OreLineValuation>,
        ]
      : []),
  ];

  const refinedColumns: DataTableColumn<RefinedRow>[] = [
    {
      id: 'material',
      header: t('miningTax.overview.detail.materialColumn'),
      stickyStart: true,
      render: (material) => typeNameCell(material.typeId),
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
        material.value === null ? '—' : <IskAmount value={material.value} decimals={0} />,
      sortValue: (material) => material.value ?? undefined,
    },
  ];

  // A day where nothing priced has a zero delta that means "unknown", not
  // "break even" — it gets neither a suggestion nor a tone.
  const anyValue = valuation.rawValue > 0 || valuation.refineValue > 0;
  const suggested: 'raw' | 'refined' | null = !anyValue
    ? null
    : totals.delta > 0
      ? 'refined'
      : totals.delta < 0
        ? 'raw'
        : null;
  const deltaTone =
    !anyValue || totals.delta === 0
      ? 'text-text'
      : totals.delta > 0
        ? 'text-isk-pos'
        : 'text-isk-neg';

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="wide"
      title={
        <span className="flex items-center gap-1.5">
          {t('miningTax.overview.detail.title', { date: entry.date, system: systemName })}
          <SecurityValue security={systemSecurity} />
          <InfoTooltip
            label={t('common.aboutLabel', { label: t('miningTax.dateColumn') })}
            content={t('miningTax.dateEveHint')}
          />
        </span>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="text-text-dim">
            <CharacterLink id={row.characterId}>{row.characterName}</CharacterLink>
            {' · '}
            <SystemLink systemId={entry.solarSystemId}>{systemName}</SystemLink>
          </span>
          <StatChips>
            <StatChip
              label={t('miningTax.overview.volumeStat')}
              value={
                <VolumeDisplay volume={totals.volume} typeNames={typeNames} t={t} suffix=" m³" />
              }
            />
            <StatChip
              label={t('miningTax.overview.detail.unitsColumn')}
              value={totals.units.toLocaleString()}
            />
            <StatChip
              label={t('miningTax.overview.detail.oreTypesStat')}
              value={valuation.lines.length.toLocaleString()}
            />
          </StatChips>
        </div>

        {/* The whole point of the row: which exit was worth more, and by how
            much. Raw and refined sit side by side so neither reads as the
            headline number on its own — with refining hidden there is
            nothing to compare, so just the raw figure stands alone. */}
        <div className={cx('grid gap-3', showRefining && 'sm:grid-cols-3')}>
          <div
            className={cx(
              CARD,
              showRefining && suggested === 'raw' ? CARD_SUGGESTED : 'border-line'
            )}
          >
            <p
              className={cx(
                CARD_LABEL,
                showRefining && suggested === 'raw' ? 'text-accent' : 'text-text-dim'
              )}
            >
              {t('miningTax.overview.detail.sellRawCard')}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              <IskAmount value={valuation.rawValue} decimals={0} />
            </p>
            <p className={CARD_HINT}>{t('miningTax.overview.detail.sellRawCardHint')}</p>
          </div>
          {showRefining && (
            <>
              <div className={cx(CARD, suggested === 'refined' ? CARD_SUGGESTED : 'border-line')}>
                <p
                  className={cx(
                    CARD_LABEL,
                    suggested === 'refined' ? 'text-accent' : 'text-text-dim'
                  )}
                >
                  {t('miningTax.overview.detail.refineCard')}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  <IskAmount value={valuation.refineValue} decimals={0} />
                </p>
                <p className={CARD_HINT}>
                  {t('miningTax.overview.detail.refineCardHint', {
                    efficiency: (valuation.efficiency * 100).toFixed(1),
                  })}
                </p>
              </div>
              <div className={cx(CARD, 'border-line')}>
                <p className={cx(CARD_LABEL, 'text-text-dim')}>
                  {!anyValue
                    ? t('miningTax.overview.detail.refineUnknownCard')
                    : totals.delta > 0
                      ? t('miningTax.overview.detail.refineGainCard')
                      : totals.delta < 0
                        ? t('miningTax.overview.detail.refineLossCard')
                        : t('miningTax.overview.detail.refineEvenCard')}
                </p>
                <p className={cx('mt-1 text-xl font-semibold tabular-nums', deltaTone)}>
                  {/* Nothing priced is unknown, not break-even: an em dash says so,
                      "0 ISK" would claim the two exits were measured and tied. */}
                  {!anyValue ? (
                    '—'
                  ) : (
                    <>
                      {totals.delta !== 0 && (totals.delta > 0 ? '+' : '-')}
                      <IskAmount value={Math.abs(totals.delta)} decimals={0} />
                    </>
                  )}
                </p>
                {totals.deltaPercent !== null && totals.deltaPercent !== 0 && (
                  <p className={cx(CARD_HINT, 'tabular-nums')}>
                    {t(
                      totals.deltaPercent > 0
                        ? 'miningTax.overview.detail.deltaPercentGain'
                        : 'miningTax.overview.detail.deltaPercentLoss',
                      { percent: Math.abs(totals.deltaPercent).toFixed(1) }
                    )}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="overflow-hidden rounded-xs border border-line">
            <div className={TABLE_TITLE}>
              <p className={TABLE_TITLE_TEXT}>{t('miningTax.overview.detail.oreMinedTitle')}</p>
              <span className={TABLE_TITLE_MENU}>
                <TableActionsMenu
                  name={t('miningTax.overview.detail.oreMinedTitle')}
                  tableExport={oreExport}
                />
              </span>
            </div>
            {/* `overflow-hidden` above is what rounds the corners, so it
                cannot scroll — the table gets its own scroller, per
                DESIGN.md §4a. Between `sm` and `lg` these five columns are
                un-stacked in a narrow box and would otherwise clip. */}
            <div className="overflow-x-auto">
              <DataTable
                {...oreExport.tableProps}
                columns={oreColumns}
                rows={valuation.lines}
                rowKey={(line) => line.typeId}
                label={t('miningTax.overview.detail.oreMinedTitle')}
                defaultSort={{ columnId: 'raw', direction: 'desc' }}
                // A compare table: raw against refined across the columns, so it
                // stays a table on a phone and scrolls sideways.
                responsive="table"
              />
            </div>
          </div>

          <div className="space-y-3">
            {showRefining && (
              <div className="overflow-hidden rounded-xs border border-line">
                <div className={TABLE_TITLE}>
                  <p className={TABLE_TITLE_TEXT}>
                    {t('miningTax.overview.detail.refinesIntoTitle')}
                  </p>
                  {refinedRows.length > 0 && (
                    <span className={TABLE_TITLE_MENU}>
                      <TableActionsMenu
                        name={t('miningTax.overview.detail.refinesIntoTitle')}
                        tableExport={refinesExport}
                      />
                    </span>
                  )}
                </div>
                {refinedRows.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-text-dim">
                    {t('miningTax.overview.detail.refinesIntoNone')}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <DataTable
                      {...refinesExport.tableProps}
                      columns={refinedColumns}
                      rows={refinedRows}
                      rowKey={(material) => material.typeId}
                      label={t('miningTax.overview.detail.refinesIntoTitle')}
                      responsive="table"
                    />
                  </div>
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
            )}

            <div className="overflow-hidden rounded-xs border border-line">
              <p className="border-b border-line bg-panel-2 px-2.5 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('miningTax.overview.detail.pricingTitle')}
              </p>
              <div className="space-y-1.5 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-text-dim">
                <p>{t('miningTax.overview.detail.priceBasisHint', { date: entry.date })}</p>
                {showRefining && (
                  <p>
                    {t('miningTax.overview.detail.refineBasisHint', {
                      character: row.characterName,
                      efficiency: (valuation.efficiency * 100).toFixed(1),
                    })}
                  </p>
                )}
                {showRefining && valuation.implantBonusPct > 0 && (
                  <p>
                    {t('miningTax.overview.detail.refineImplantHint', {
                      pct: valuation.implantBonusPct,
                    })}
                  </p>
                )}
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
