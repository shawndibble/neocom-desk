import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState, type ReactNode } from 'react';
import { facilityBaseYieldFor } from '@/engine/industry/refiningSetup';
import { InlinePercent } from '@/features/refining/InlinePercent';
import { useTranslation } from 'react-i18next';
import { Button, DataTable, Modal, InfoTooltip, type DataTableColumn } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { HintText } from '@/components/ui/HintText';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { cx } from '@/lib/cx';
import { formatIsk, formatIskAuto } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { REFINE_BASES, type Appraisal, type RefineBasis } from '@/engine/market/appraisal';
import {
  basisAvailable,
  buildRefineComparison,
  lopsidedItems,
  LOPSIDED_SELL_RATIO,
  type RefineBreakdown,
  type RefineItemLine,
  type RefineMineralLine,
} from '@/engine/market/refineBreakdown';
import { createNumberFormat } from '@/lib/numberLocale';
import { formatVolume } from './format';
import { efficiencyText, pct, skillsText } from './refineFormat';

export interface SharedRefineView {
  generatedAt: number;
  source: 'shared' | 'mine';
  unavailable: 'signedOut' | 'loading' | 'failed' | null;
  onToggleSource: () => void;
}

interface RefineBreakdownModalProps {
  open: boolean;
  onClose: () => void;
  appraisal: Pick<Appraisal, 'rows' | 'items'>;
  pricePercent: number;
  hubName: string;
  setup: { yieldRate: number; taxRate: number };
  mineralNames: ReadonlyMap<number, string>;
  initialTypeId: number | null;
  basis: RefineBasis;
  onBasisChange: (basis: RefineBasis) => void;
  editSetup?: { onYield: (fraction: number) => void; onTax: (fraction: number) => void };
  shared?: SharedRefineView;
}

const oneDecimal = createNumberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface BasisRow {
  key: RefineBasis;
  breakdown: RefineBreakdown | null;
}

type MineralRow =
  | { kind: 'mineral'; key: string; line: RefineMineralLine }
  | {
      kind: 'subtotal' | 'tax' | 'net' | 'leftover' | 'total';
      key: string;
      label: string;
      value: number;
    };

export function RefineBreakdownModal({
  open,
  onClose,
  appraisal,
  pricePercent,
  hubName,
  setup,
  mineralNames,
  initialTypeId,
  basis,
  onBasisChange,
  editSetup,
  shared,
}: RefineBreakdownModalProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [typeId, setTypeId] = useState<number | null>(initialTypeId);

  const input = { appraisal, pricePercent, taxRate: setup.taxRate };
  const all = buildRefineComparison(input);
  const scoped = typeId === null ? all : buildRefineComparison({ ...input, onlyTypeId: typeId });
  const single = typeId === null ? null : (scoped.buy.items[0] ?? null);
  const comparison = single === null ? all : scoped;
  const activeBasis: RefineBasis = basisAvailable(appraisal, basis) ? basis : 'buy';
  const breakdown = comparison[activeBasis] ?? comparison.buy;

  const nameOf = (id: number): string => mineralNames.get(id) || `#${id}`;
  const basisName = (key: RefineBasis): string => t(`market.appraisal.breakdown.basis.${key}`);
  const basisInline = (key: RefineBasis): string =>
    t(`market.appraisal.breakdown.basisInline.${key}`);

  const title =
    single === null
      ? t('market.appraisal.breakdown.titleAll', { count: all.buy.items.length })
      : t('market.appraisal.breakdown.titleItem', { name: single.name });

  const basisRows: BasisRow[] = REFINE_BASES.map((key) => ({ key, breakdown: comparison[key] }));
  const basisColumns: DataTableColumn<BasisRow>[] = [
    {
      id: 'basis',
      stickyStart: true,
      header: t('market.appraisal.breakdown.columnBasis'),
      render: (row) => (
        <span className="flex flex-col">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cx(
                'inline-block size-2.5 shrink-0 rounded-full border',
                row.key === activeBasis ? 'border-accent bg-accent' : 'border-text-dim'
              )}
            />
            {basisName(row.key)}
            {row.key === activeBasis && (
              <span className="text-[0.6875rem] font-semibold tracking-widest text-accent uppercase max-sm:sr-only">
                {t('market.appraisal.breakdown.selected')}
              </span>
            )}
          </span>
          <span className="pl-[1.125rem] text-[0.6875rem] font-normal text-text-dim">
            {row.breakdown === null
              ? t('market.appraisal.breakdown.basisUnavailable')
              : t(`market.appraisal.breakdown.basisHint.${row.key}`, { hub: hubName })}
          </span>
        </span>
      ),
    },
    {
      id: 'asIs',
      header: t('market.appraisal.breakdown.columnAsIs'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => (row.breakdown === null ? '—' : formatIsk(row.breakdown.asIs, 0)),
    },
    {
      id: 'minerals',
      header: t('market.appraisal.breakdown.columnRefined'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => (row.breakdown === null ? '—' : formatIsk(row.breakdown.net, 0)),
    },
    {
      id: 'refined',
      header: t('market.appraisal.breakdown.columnRefinedWithLeftover'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => (row.breakdown === null ? '—' : formatIsk(row.breakdown.total, 0)),
    },
    {
      id: 'difference',
      header: t('market.appraisal.breakdown.columnDifference'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => {
        if (row.breakdown === null) return '—';
        const { difference, refineWins } = row.breakdown;
        return (
          <span className={refineWins ? 'font-semibold text-isk-pos' : 'text-text-dim'}>
            {difference > 0 ? '+' : '−'}
            {formatIsk(Math.abs(difference), 0)}
          </span>
        );
      },
    },
  ];

  const action = t(
    breakdown.refineWins
      ? 'market.appraisal.breakdown.actionRefine'
      : 'market.appraisal.breakdown.actionSell'
  );

  const lopsided = lopsidedItems(appraisal.items, typeId ?? undefined);
  const lopsidedNames = lopsided.map((item) => item.name).join(', ');

  const mineralRows: MineralRow[] = [
    ...breakdown.minerals.map((line): MineralRow => ({
      kind: 'mineral',
      key: `m${line.typeId}`,
      line,
    })),
    {
      kind: 'subtotal',
      key: 'subtotal',
      label: t('market.appraisal.breakdown.subtotal'),
      value: breakdown.mineralValue,
    },
    ...(breakdown.tax > 0
      ? [
          {
            kind: 'tax' as const,
            key: 'tax',
            label: t('market.appraisal.breakdown.taxLine', {
              percent: pct(setup.taxRate).replace('%', ''),
            }),
            value: -breakdown.tax,
          },
        ]
      : []),
    ...(breakdown.tax > 0 && breakdown.unitsLeftOver > 0
      ? [
          {
            kind: 'net' as const,
            key: 'net',
            label: t('market.appraisal.breakdown.refineFigure'),
            value: breakdown.net,
          },
        ]
      : []),
    ...(breakdown.unitsLeftOver > 0
      ? [
          {
            kind: 'leftover' as const,
            key: 'leftover',
            label: t('market.appraisal.breakdown.leftoverLine', {
              count: breakdown.unitsLeftOver,
            }),
            value: breakdown.leftoverValue,
          },
        ]
      : []),
    {
      kind: 'total',
      key: 'total',
      label: t(
        breakdown.unitsLeftOver > 0
          ? 'market.appraisal.breakdown.totalWithLeftover'
          : 'market.appraisal.breakdown.total'
      ),
      value: breakdown.total,
    },
  ];

  const priceCell = (price: number | null, isBasis: boolean): ReactNode =>
    price === null ? (
      '—'
    ) : (
      <span className={isBasis ? undefined : 'text-text-dim'}>{formatIskAuto(price)}</span>
    );
  const mineralColumns: DataTableColumn<MineralRow>[] = [
    {
      id: 'mineral',
      stickyStart: true,
      header: t('market.appraisal.breakdown.columnMineral'),
      render: (row) => (row.kind === 'mineral' ? nameOf(row.line.typeId) : row.label),
    },
    {
      id: 'quantity',
      header: t('market.appraisal.breakdown.columnQuantity'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => (row.kind === 'mineral' ? formatVolume(row.line.quantity) : ''),
    },
    {
      id: 'buyPrice',
      header: t('market.appraisal.breakdown.columnBuyPrice'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) =>
        row.kind === 'mineral' ? priceCell(row.line.buyPrice, activeBasis !== 'sell') : '',
    },
    {
      id: 'sellPrice',
      header: t('market.appraisal.breakdown.columnSellPrice'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) =>
        row.kind === 'mineral' ? priceCell(row.line.sellPrice, activeBasis !== 'buy') : '',
    },
    {
      id: 'value',
      header: t('market.appraisal.breakdown.columnValue', { percent: pricePercent }),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => {
        if (row.kind !== 'mineral') {
          return (row.kind === 'leftover' ? '+' : '') + formatIsk(row.value, 0);
        }
        return row.line.price === null ? (
          <span className="text-warning">—</span>
        ) : (
          formatIsk(row.line.value, 0)
        );
      },
    },
  ];

  const itemColumns: DataTableColumn<RefineItemLine>[] = [
    {
      id: 'item',
      stickyStart: true,
      header: t('market.appraisal.columnItem'),
      render: (line) => <span className="text-accent">{line.name}</span>,
    },
    {
      id: 'quantity',
      header: t('market.appraisal.columnQuantity'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (line) => formatVolume(line.quantity),
    },
    {
      id: 'asIs',
      header: t('market.appraisal.breakdown.columnAsIsOn', {
        basis: basisInline(activeBasis),
      }),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (line) => formatIsk(line.asIs, 0),
    },
    {
      id: 'minerals',
      header: t('market.appraisal.breakdown.columnRefinedOn', {
        basis: basisInline(activeBasis),
      }),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (line) => formatIsk(line.refined, 0),
    },
    {
      id: 'refined',
      header: t('market.appraisal.breakdown.columnRefinedWithLeftoverOn', {
        basis: basisInline(activeBasis),
      }),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (line) => formatIsk(line.refined + line.leftoverValue, 0),
    },
    {
      id: 'better',
      header: t('market.appraisal.breakdown.columnBetter'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (line) =>
        line.wins
          ? t('market.appraisal.breakdown.betterRefine')
          : t('market.appraisal.breakdown.betterSell'),
    },
  ];

  const skillsMultiplier =
    breakdown.efficiencyMin !== null &&
    breakdown.efficiencyMax !== null &&
    setup.yieldRate > 0 &&
    Math.abs(breakdown.efficiencyMax - breakdown.efficiencyMin) < 1e-9
      ? breakdown.efficiencyMin / setup.yieldRate
      : null;
  const hasRange =
    breakdown.efficiencyMin !== null &&
    breakdown.efficiencyMax !== null &&
    Math.abs(breakdown.efficiencyMax - breakdown.efficiencyMin) >= 1e-9;
  const usingMine = shared?.source === 'mine';
  const assumingDefault = setup.yieldRate === 0.5;
  const yours = efficiencyText(breakdown.efficiencyMin, breakdown.efficiencyMax);

  return (
    <Modal open={open} onClose={onClose} title={title} placement="wide">
      <div className="flex flex-col gap-6">
        {shared && (
          <div
            className={cx(
              'flex flex-wrap items-center justify-between gap-2 rounded-xs border px-3 py-2',
              usingMine ? 'border-success bg-success/10' : 'border-line bg-panel'
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {usingMine
                  ? t('market.appraisal.breakdown.sharedUsingMine')
                  : t('market.appraisal.breakdown.sharedTitle')}
              </p>
              <p className="text-xs text-text-dim">
                {usingMine
                  ? t('market.appraisal.breakdown.sharedUsingMineHint')
                  : t('market.appraisal.breakdown.sharedHint', {
                      time: formatTimestamp(new Date(shared.generatedAt * 1000), timeZone),
                    })}
              </p>
            </div>
            <Button
              size="sm"
              onClick={shared.onToggleSource}
              aria-disabled={(shared.unavailable !== null && !usingMine) || undefined}
              loading={shared.unavailable === 'loading'}
            >
              {usingMine
                ? t('market.appraisal.breakdown.backToShared')
                : t('market.appraisal.breakdown.useMine')}
            </Button>
            {(shared.unavailable === 'signedOut' || shared.unavailable === 'failed') &&
              !usingMine && (
                <p className="w-full text-xs text-text-dim">
                  {shared.unavailable === 'signedOut'
                    ? t('market.appraisal.breakdown.useMineSignedOut')
                    : t('market.appraisal.breakdown.useMineFailed')}
                </p>
              )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SetupBox
              label={t('market.appraisal.breakdown.efficiency')}
              tooltip={t('market.appraisal.breakdown.efficiencyHelp')}
              accent
            >
              {editSetup && skillsMultiplier !== null ? (
                <InlinePercent
                  fraction={breakdown.efficiencyMin ?? 0}
                  name={t('market.appraisal.breakdown.efficiency')}
                  min={1}
                  max={Math.floor(skillsMultiplier * 100)}
                  onCommit={(total) => {
                    const base = facilityBaseYieldFor(total, skillsMultiplier);
                    if (base !== null) editSetup.onYield(base);
                  }}
                />
              ) : (
                yours
              )}
            </SetupBox>
            <SetupBox
              label={t('market.appraisal.refineYield')}
              tooltip={t('market.appraisal.refineYieldHelp')}
            >
              {editSetup ? (
                <InlinePercent
                  fraction={setup.yieldRate}
                  name={t('market.appraisal.refineYield')}
                  min={1}
                  max={100}
                  onCommit={editSetup.onYield}
                />
              ) : (
                pct(setup.yieldRate)
              )}
            </SetupBox>
            <SetupBox
              label={t('market.appraisal.breakdown.skills')}
              tooltip={t('market.appraisal.breakdown.skillsHelp')}
            >
              <span className="px-1">
                {skillsText(breakdown.efficiencyMin, breakdown.efficiencyMax, setup.yieldRate)}
              </span>
            </SetupBox>
            <SetupBox
              label={t('market.appraisal.refineTax')}
              tooltip={t('market.appraisal.refineTaxHelp')}
            >
              {editSetup ? (
                <InlinePercent
                  fraction={setup.taxRate}
                  name={t('market.appraisal.refineTax')}
                  min={0}
                  max={100}
                  onCommit={editSetup.onTax}
                />
              ) : (
                pct(setup.taxRate)
              )}
            </SetupBox>
          </div>
          {hasRange && (
            <p className="text-xs text-text-dim">
              {t('market.appraisal.breakdown.skillsRangeNote')}
            </p>
          )}
          {assumingDefault && (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} className="mt-px shrink-0" />
              {shared
                ? t('market.appraisal.breakdown.assumingNpcShared')
                : t('market.appraisal.breakdown.assumingNpc')}
            </p>
          )}
        </div>

        {breakdown.items.length === 0 ? (
          <p className="text-sm text-text-dim">{t('market.appraisal.breakdown.nothing')}</p>
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={SECTION_HEADING}>
                  {t('market.appraisal.breakdown.comparisonTitle')}
                </h3>
                <p className="flex items-center gap-2 text-xs">
                  <span className={SECTION_HEADING}>
                    {t('market.appraisal.breakdown.suggestedAction')}
                  </span>
                  <span
                    className={cx(
                      'inline-flex items-baseline gap-2 rounded-xs border px-2.5 py-1',
                      breakdown.refineWins
                        ? 'border-success bg-success/10'
                        : 'border-accent bg-accent/10'
                    )}
                  >
                    <b
                      className={cx(
                        'text-sm font-semibold',
                        breakdown.refineWins ? 'text-success' : 'text-accent'
                      )}
                    >
                      {action}
                    </b>
                  </span>
                </p>
              </div>
              <DataTable
                columns={basisColumns}
                rows={basisRows}
                rowKey={(row) => row.key}
                selectedRowKey={activeBasis}
                rowClickable={(row) => row.breakdown !== null}
                onRowClick={(row) => onBasisChange(row.key)}
                label={t('market.appraisal.breakdown.comparisonTitle')}
                responsive="table"
                stickyHeader={false}
              />
              {lopsided.length > 0 && comparison.sell !== null && (
                <p className="flex items-start gap-1.5 text-xs text-warning">
                  <Icon.Warn
                    aria-hidden="true"
                    size={Icon.ICON_SIZE.sm}
                    className="mt-px shrink-0"
                  />
                  <HintText content={lopsidedNames}>
                    {t('market.appraisal.breakdown.lopsided', {
                      count: lopsided.length,
                      ratio: LOPSIDED_SELL_RATIO,
                    })}
                  </HintText>
                </p>
              )}
            </section>

            <p className="flex items-start gap-1.5 border-l-2 border-accent pl-2.5 text-xs text-text-dim">
              <span>
                {breakdown.breakEvenEfficiency === null
                  ? t(
                      breakdown.asIs <= 0
                        ? 'market.appraisal.breakdown.nothingToCompare'
                        : 'market.appraisal.breakdown.neverWins',
                      { basis: basisInline(activeBasis), yours }
                    )
                  : t(
                      breakdown.breakEvenEfficiency > 1
                        ? 'market.appraisal.breakdown.breakEvenNever'
                        : 'market.appraisal.breakdown.breakEvenAt',
                      {
                        breakEven: pct(breakdown.breakEvenEfficiency),
                        basis: basisInline(activeBasis),
                        yours,
                      }
                    )}
              </span>
              <InfoTooltip
                label={t('common.aboutLabel', {
                  label: t('market.appraisal.breakdown.comparisonTitle'),
                })}
                content={t('market.appraisal.breakdown.topOfBook')}
              />
            </p>

            <section
              className="flex flex-col gap-2"
              aria-label={t('market.appraisal.breakdown.mineralsTitle')}
            >
              <h3 className={SECTION_HEADING}>
                {t(
                  single === null
                    ? 'market.appraisal.breakdown.mineralsTitleOn'
                    : 'market.appraisal.breakdown.mineralsTitleItemOn',
                  { basis: basisInline(activeBasis) }
                )}
              </h3>
              <DataTable
                columns={mineralColumns}
                rows={mineralRows}
                rowKey={(row) => row.key}
                rowClassName={(row) =>
                  row.kind === 'subtotal'
                    ? 'border-t-2 border-line-bright font-semibold'
                    : row.kind === 'leftover' || row.kind === 'tax'
                      ? 'text-text-dim'
                      : undefined
                }
                label={t('market.appraisal.breakdown.mineralsTitle')}
                responsive="table"
              />
              {!breakdown.pricedAll && (
                <p className="text-[0.6875rem] text-warning">
                  {t('market.appraisal.breakdown.unpriced', { basis: basisInline(activeBasis) })}
                </p>
              )}
              {breakdown.unbuyable > 0 && (
                <p className="text-[0.6875rem] text-warning">
                  {t('market.appraisal.breakdown.unbuyable', {
                    count: breakdown.unbuyable,
                    basis: basisInline(activeBasis),
                  })}
                </p>
              )}
            </section>

            {single === null ? (
              breakdown.items.length > 1 && (
                <section className="flex flex-col gap-2">
                  <h3 className={SECTION_HEADING}>
                    {t('market.appraisal.breakdown.perItemTitleOn', {
                      basis: basisInline(activeBasis),
                    })}
                  </h3>
                  <DataTable
                    columns={itemColumns}
                    rows={breakdown.items}
                    rowKey={(line) => line.typeId}
                    onRowClick={(line) => setTypeId(line.typeId)}
                    label={t('market.appraisal.breakdown.perItemTitle')}
                    responsive="table"
                  />
                </section>
              )
            ) : (
              <section className="flex flex-col gap-2">
                <h3 className={SECTION_HEADING}>{t('market.appraisal.breakdown.mathTitle')}</h3>
                <ItemMath line={single} nameOf={nameOf} />
              </section>
            )}

            {single !== null && (
              <div>
                <button
                  type="button"
                  className={textActionClassName('inline-flex items-center gap-1')}
                  onClick={() => setTypeId(null)}
                >
                  <Icon.Back aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                  {t('market.appraisal.breakdown.allItems')}
                </button>
              </div>
            )}
            {breakdown.skipped > 0 && single === null && (
              <p className="text-xs text-text-dim">
                {t('market.appraisal.breakdown.skipped', { count: breakdown.skipped })}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

const SECTION_HEADING = eyebrowClassName;

function SetupBox({
  label,
  tooltip,
  accent = false,
  children,
}: {
  label: string;
  tooltip: string;
  accent?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xs border border-line bg-panel px-2.5 py-1.5">
      <span className={`${eyebrowClassName} flex items-center gap-1`}>
        {label}
        <InfoTooltip label={t('common.aboutLabel', { label })} content={tooltip} />
      </span>
      <span
        className={cx(
          'flex min-h-9 items-center text-sm font-medium tabular-nums md:min-h-0',
          accent && 'text-accent'
        )}
      >
        {children}
      </span>
    </div>
  );
}

function ItemMath({ line, nameOf }: { line: RefineItemLine; nameOf: (typeId: number) => string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-0.5 overflow-x-auto rounded-xs border border-line bg-panel px-3 py-2 font-mono text-xs whitespace-nowrap text-text-dim">
      <span>
        {t('market.appraisal.breakdown.mathBatches', {
          quantity: formatVolume(line.quantity),
          portion: line.portionSize,
          batches: formatVolume(line.batches),
          left: formatVolume(line.unitsLeftOver),
        })}
      </span>
      {line.outputs.map((output) => (
        <span key={output.typeId}>
          {t('market.appraisal.breakdown.mathMineral', {
            name: nameOf(output.typeId),
            perPortion: formatVolume(output.perPortion),
            batches: formatVolume(line.batches),
            efficiency: line.efficiency.toFixed(4),
            exact: oneDecimal(output.perPortion * line.batches * line.efficiency),
            floored: formatVolume(output.quantity),
          })}
        </span>
      ))}
    </div>
  );
}
