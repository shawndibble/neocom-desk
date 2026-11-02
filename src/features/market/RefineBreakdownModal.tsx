/**
 * The Refine breakdown: the arithmetic behind an Appraisal's Refine figure,
 * for the whole pile or one item of it, so a pilot can both decide between
 * refining and selling as is, and check every number against another tool.
 *
 * One component for two homes. On the live Appraisal tab the Refining Setup is
 * editable in place and the numbers follow it. On a **Shared Appraisal** the
 * sharer's own numbers are shown as shared, and a signed-in visitor can swap in
 * their own (`shared`), which recomputes the same breakdown from their skills.
 *
 * All the figures come from `buildRefineBreakdown`; this only lays them out.
 */
import { useState, type ReactNode } from 'react';
import { facilityBaseYieldFor } from '@/engine/industry/refiningSetup';
import { InlinePercent } from '@/features/refining/InlinePercent';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  IskAmount,
  Modal,
  InfoTooltip,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { cx } from '@/lib/cx';
import { formatIsk, formatIskAuto } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import type { Appraisal } from '@/engine/market/appraisal';
import {
  buildRefineBreakdown,
  type RefineItemLine,
  type RefineMineralLine,
} from '@/engine/market/refineBreakdown';
import { createNumberFormat } from '@/lib/numberLocale';
import { formatVolume } from './format';
import { efficiencyText, pct, skillsText } from './refineFormat';

/** Whose numbers a Shared Appraisal's breakdown is showing, and what swapping needs. */
export interface SharedRefineView {
  /** Epoch seconds the sharer priced the appraisal. */
  generatedAt: number;
  /** `mine` is the visitor's own skills and Refining Setup; `shared` is the sharer's. */
  source: 'shared' | 'mine';
  /** Why "Use my numbers" can't be pressed yet; null when it can. */
  unavailable: 'signedOut' | 'loading' | 'failed' | null;
  onToggleSource: () => void;
}

interface RefineBreakdownModalProps {
  open: boolean;
  onClose: () => void;
  appraisal: Pick<Appraisal, 'rows' | 'items'>;
  pricePercent: number;
  hubName: string;
  /** The facility yield and tax the figures were worked out at, as fractions. */
  setup: { yieldRate: number; taxRate: number };
  mineralNames: ReadonlyMap<number, string>;
  /** The item to open on, or null for the whole pile. */
  initialTypeId: number | null;
  /** Live tab only: makes the facility yield and tax editable in place; each change is saved as it is made. */
  editSetup?: { onYield: (fraction: number) => void; onTax: (fraction: number) => void };
  /** Shared page only. */
  shared?: SharedRefineView;
}

/** The unrounded yield, so the line shows what "rounding down" rounds. */
const oneDecimal = createNumberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function RefineBreakdownModal({
  open,
  onClose,
  appraisal,
  pricePercent,
  hubName,
  setup,
  mineralNames,
  initialTypeId,
  editSetup,
  shared,
}: RefineBreakdownModalProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [typeId, setTypeId] = useState<number | null>(initialTypeId);

  const all = buildRefineBreakdown({
    appraisal,
    pricePercent,
    taxRate: setup.taxRate,
  });
  const scoped =
    typeId === null
      ? all
      : buildRefineBreakdown({
          appraisal,
          pricePercent,
          taxRate: setup.taxRate,
          onlyTypeId: typeId,
        });
  // A chosen item that stops refining (the appraisal changed, or the visitor's numbers have no
  // recipe for it) falls back to the whole pile rather than leaving an empty scope with no way out.
  const single = typeId === null ? null : (scoped.items[0] ?? null);
  const breakdown = single === null ? all : scoped;

  const nameOf = (id: number): string => mineralNames.get(id) || `#${id}`;

  const title =
    single === null
      ? t('market.appraisal.breakdown.titleAll', { count: all.items.length })
      : t('market.appraisal.breakdown.titleItem', { name: single.name });

  const mineralColumns: DataTableColumn<RefineMineralLine>[] = [
    {
      id: 'mineral',
      stickyStart: true,
      header: t('market.appraisal.breakdown.columnMineral'),
      render: (line) => nameOf(line.typeId),
    },
    {
      id: 'quantity',
      header: t('market.appraisal.breakdown.columnQuantity'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (line) => formatVolume(line.quantity),
    },
    {
      id: 'price',
      header: t('market.appraisal.breakdown.columnPrice'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (line) => (line.price === null ? '—' : formatIskAuto(line.price)),
    },
    {
      id: 'value',
      header: t('market.appraisal.breakdown.columnValue', { percent: pricePercent }),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (line) =>
        line.price === null ? <span className="text-warning">—</span> : formatIsk(line.value, 0),
    },
  ];

  const itemColumns: DataTableColumn<RefineItemLine>[] = [
    {
      id: 'item',
      stickyStart: true,
      header: t('market.appraisal.columnItem'),
      // The row is the control (a click or Enter opens that item); the accent marks it.
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
      header: t('market.appraisal.breakdown.columnAsIs'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (line) => formatIsk(line.asIs, 0),
    },
    {
      id: 'refined',
      header: t('market.appraisal.breakdown.columnRefined'),
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

  // One skills multiplier across the items lets a typed reprocessing yield be divided back down to the
  // facility's base yield; with several (ores trained to different levels) there is no single answer.
  const skillsMultiplier =
    breakdown.efficiencyMin !== null &&
    breakdown.efficiencyMax !== null &&
    setup.yieldRate > 0 &&
    Math.abs(breakdown.efficiencyMax - breakdown.efficiencyMin) < 1e-9
      ? breakdown.efficiencyMin / setup.yieldRate
      : null;
  const usingMine = shared?.source === 'mine';
  const assumingDefault = setup.yieldRate === 0.5;

  return (
    <Modal open={open} onClose={onClose} title={title} placement="wide">
      <div className="flex flex-col gap-4">
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
              disabled={shared.unavailable !== null && !usingMine}
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

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          <SetupBox
            label={t('market.appraisal.breakdown.skills')}
            tooltip={t('market.appraisal.breakdown.skillsHelp')}
          >
            {skillsText(breakdown.efficiencyMin, breakdown.efficiencyMax, setup.yieldRate)}
          </SetupBox>
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
              efficiencyText(breakdown.efficiencyMin, breakdown.efficiencyMax)
            )}
          </SetupBox>
        </div>
        {assumingDefault && (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} className="mt-px shrink-0" />
            {shared
              ? t('market.appraisal.breakdown.assumingNpcShared')
              : t('market.appraisal.breakdown.assumingNpc')}
          </p>
        )}

        {breakdown.items.length === 0 ? (
          <p className="text-sm text-text-dim">{t('market.appraisal.breakdown.nothing')}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <VerdictCard
                label={t('market.appraisal.breakdown.sellAsIs')}
                value={breakdown.asIs}
                note={t('market.appraisal.breakdown.sellAsIsNote', { hub: hubName })}
                better={!breakdown.refineWins}
              />
              <VerdictCard
                label={t('market.appraisal.breakdown.refineThenSell')}
                value={breakdown.total}
                note={
                  breakdown.asIs > 0
                    ? t(
                        breakdown.difference >= 0
                          ? 'market.appraisal.breakdown.aheadNote'
                          : 'market.appraisal.breakdown.behindNote',
                        {
                          amount: formatIskAuto(Math.abs(breakdown.difference)),
                          percent: (
                            (Math.abs(breakdown.difference) / breakdown.asIs) *
                            100
                          ).toFixed(1),
                        }
                      )
                    : ''
                }
                better={breakdown.refineWins}
              />
            </div>

            <p className="border-l-2 border-accent pl-2.5 text-xs text-text-dim">
              {breakdown.breakEvenEfficiency === null
                ? t(
                    breakdown.asIs <= 0
                      ? 'market.appraisal.breakdown.nothingToCompare'
                      : 'market.appraisal.breakdown.neverWins'
                  )
                : t(
                    breakdown.refineWins
                      ? 'market.appraisal.breakdown.breakEvenWin'
                      : 'market.appraisal.breakdown.breakEvenLose',
                    {
                      breakEven: pct(breakdown.breakEvenEfficiency),
                      yours: efficiencyText(breakdown.efficiencyMin, breakdown.efficiencyMax),
                    }
                  )}{' '}
              {t('market.appraisal.breakdown.topOfBook')}
            </p>

            <section
              className="flex flex-col gap-1"
              aria-label={t('market.appraisal.breakdown.mineralsTitle')}
            >
              <h3 className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
                {single === null
                  ? t('market.appraisal.breakdown.mineralsTitle')
                  : t('market.appraisal.breakdown.mineralsTitleItem')}
              </h3>
              <DataTable
                columns={mineralColumns}
                rows={breakdown.minerals}
                rowKey={(line) => line.typeId}
                label={t('market.appraisal.breakdown.mineralsTitle')}
                responsive="table"
              />
              <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-xs tabular-nums">
                <Total
                  label={t('market.appraisal.breakdown.subtotal')}
                  value={breakdown.mineralValue}
                />
                {breakdown.tax > 0 && (
                  <Total
                    dim
                    label={t('market.appraisal.breakdown.taxLine', {
                      percent: pct(setup.taxRate).replace('%', ''),
                    })}
                    value={-breakdown.tax}
                  />
                )}
                {breakdown.tax > 0 && breakdown.unitsLeftOver > 0 && (
                  <Total
                    label={t('market.appraisal.breakdown.refineFigure')}
                    value={breakdown.net}
                  />
                )}
                {breakdown.unitsLeftOver > 0 && (
                  <>
                    <Total
                      dim
                      label={t('market.appraisal.breakdown.leftoverLine', {
                        count: breakdown.unitsLeftOver,
                      })}
                      value={breakdown.leftoverValue}
                      plus
                    />
                  </>
                )}
                <Total
                  strong
                  label={t(
                    breakdown.unitsLeftOver > 0
                      ? 'market.appraisal.breakdown.totalWithLeftover'
                      : 'market.appraisal.breakdown.total'
                  )}
                  value={breakdown.total}
                />
              </dl>
              {!breakdown.pricedAll && (
                <p className="text-[0.6875rem] text-warning">
                  {t('market.appraisal.breakdown.unpriced')}
                </p>
              )}
              {breakdown.unbuyable > 0 && (
                <p className="text-[0.6875rem] text-warning">
                  {t('market.appraisal.breakdown.unbuyable', { count: breakdown.unbuyable })}
                </p>
              )}
            </section>

            {single === null ? (
              breakdown.items.length > 1 && (
                <section className="flex flex-col gap-1">
                  <h3 className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('market.appraisal.breakdown.perItemTitle')}
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
              <section className="flex flex-col gap-1">
                <h3 className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('market.appraisal.breakdown.mathTitle')}
                </h3>
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

/** One of the four setup readouts: a label, its explanation, and the figure (or the field that edits it). */
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
      <span className="flex items-center gap-1 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
        <InfoTooltip label={t('common.aboutLabel', { label })} content={tooltip} />
      </span>
      <span className={cx('text-sm font-medium tabular-nums', accent && 'text-accent')}>
        {children}
      </span>
    </div>
  );
}

function VerdictCard({
  label,
  value,
  note,
  better,
}: {
  label: string;
  value: number;
  note: string;
  better: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cx(
        'flex flex-col gap-0.5 rounded-xs border px-3 py-2',
        better ? 'border-accent bg-accent/10' : 'border-line bg-panel'
      )}
    >
      <span className="flex items-center justify-between gap-2 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
        {better && <span className="text-accent">{t('market.appraisal.breakdown.better')}</span>}
      </span>
      <span className="text-xl font-semibold tabular-nums">
        <IskAmount value={value} decimals={0} />
      </span>
      <span className="text-[0.6875rem] text-text-dim">{note}</span>
    </div>
  );
}

function Total({
  label,
  value,
  strong = false,
  dim = false,
  plus = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
  dim?: boolean;
  plus?: boolean;
}) {
  return (
    <>
      <dt className={cx(dim && 'text-text-dim', strong && 'font-semibold')}>{label}</dt>
      <dd className={cx('text-right', dim && 'text-text-dim', strong && 'font-semibold')}>
        {plus && value > 0 ? '+' : ''}
        {formatIsk(value, 0)}
      </dd>
    </>
  );
}

/** One item's batch arithmetic, line by line, so each mineral quantity can be recomputed by hand. */
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
