/**
 * The planner's three readouts, in the order a phone needs them: the verdict,
 * then the chain, then the rate table.
 *
 * The order is DOM order, not a `order-*` utility, because that is the whole
 * point — on a 390px screen the answer must not sit below twenty rows of tree.
 * A visual reorder would let the two drift apart silently.
 *
 * Two accounting choices from `engine/pi/chain.ts` are stated on screen rather
 * than left implicit, because a reader who does not know them will misread
 * every number here:
 *
 * - Customs is charged per **planet** boundary, so the tax rows split into
 *   in / out / between-planets and the between-planets row is where the
 *   layout decision actually lands.
 * - P0 you extract is valued at the hub, not at zero, so the P0 floor's edge
 *   is the processing margin and customs it avoids — not free inputs.
 *
 * And the footprint rides beside every margin: a character can run six
 * planets, so a floor that wins on ISK while needing forty factory pins has
 * not won.
 */
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataAgeBadge, DataTable, EmptyState, InfoTooltip, Panel, StatChip } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import type { PiTier, SourcingFloor } from '@/engine/pi/chain';
import { formatIsk } from '@/lib/isk';
import { taxSplit, type PlanCostResult, type PlanRow, type SensitivityRow } from './planModel';

const RATE_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const PER_HOUR_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

/** A customs rate (a fraction) as a percentage, e.g. 0.155 -> "15.5%". */
function formatRate(rate: number): string {
  return `${RATE_FORMAT.format(rate * 100)}%`;
}

function iskTone(value: number): 'positive' | 'negative' {
  return value >= 0 ? 'positive' : 'negative';
}

function iskToneClass(value: number): string {
  return value >= 0 ? 'text-isk-pos' : 'text-isk-neg';
}

interface LedgerRowProps {
  label: string;
  value: ReactNode;
  tooltip?: string;
  emphasized?: boolean;
  /** Same vocabulary as `features/industry/ResultsSummary`'s `CostRow`, not a raw class name. */
  tone?: 'negative' | 'positive';
}

function LedgerRow({ label, value, tooltip, emphasized = false, tone }: LedgerRowProps) {
  const { t } = useTranslation();
  const toneClass =
    tone === 'negative'
      ? 'text-isk-neg'
      : tone === 'positive'
        ? 'text-isk-pos'
        : emphasized
          ? 'text-accent'
          : 'text-text';
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[0.6875rem]">
      <span className="flex items-center gap-1.5 font-semibold tracking-widest text-text-dim uppercase">
        {/* The text is its own element so the tooltip trigger beside it never
            becomes part of the row label a reader (or a test) matches on. */}
        <span>{label}</span>
        {tooltip && <InfoTooltip label={t('common.aboutLabel', { label })} content={tooltip} />}
      </span>
      <span className={`font-medium tabular-nums ${emphasized ? 'text-sm' : ''} ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

export interface FootprintProps {
  factoryPins: number;
  /** Extractor programs, on the P0 floor only. */
  extractors: number | null;
}

/**
 * The pins and extractors a floor costs.
 *
 * Deliberately *not* the engine's `planetCount`: that is how many planet
 * boundaries the layout puts inside the chain — always 1 on `single-planet` —
 * which is the number the customs bill is charged over, not the number of
 * planets the operation occupies. Showing it under a six-planet-cap tooltip
 * would read as "40 pins and 9 extractors fit on 1 planet", which is the exact
 * confident-wrong-number this surface exists to prevent. The tax-boundary
 * count keeps its own labelled row in the verdict instead.
 */
function useFootprintText(): (factoryPins: number, extractors: number | null) => string {
  const { t } = useTranslation();
  return (factoryPins, extractors) => {
    const pins = t('piPlan.footprintPins', { count: factoryPins });
    if (extractors == null) return pins;
    return t('piPlan.footprintJoin', {
      pins,
      extractors: t('piPlan.footprintExtractors', { count: extractors }),
    });
  };
}

/** Pins and — on the P0 floor — extractors, as a plain figure. Never a feasibility verdict. */
export function Footprint({ factoryPins, extractors }: FootprintProps) {
  const { t } = useTranslation();
  const footprintText = useFootprintText();
  return (
    <StatChip
      label={t('piPlan.footprintLabel')}
      value={footprintText(factoryPins, extractors)}
      tooltip={t('piPlan.footprintTooltip')}
    />
  );
}

interface PlanVerdictProps {
  result: PlanCostResult;
  targetTier: PiTier;
  targetName: string;
  unitsPerDay: number;
  factoryPins: number;
  hubName: string;
  /** When the hub prices behind these numbers were read; null before they land. */
  pricesFetchedAt: Date | null;
  /**
   * The editable yield input, passed only on the P0 floor — the one floor it
   * applies to. It lives here rather than in the controls rail so that
   * entering a rate does not move the field out from under the cursor the
   * instant the first digit makes the chain costable.
   */
  extractionRateField?: ReactNode;
}

/**
 * Revenue, input cost, customs in / out / between planets, and margin — or an
 * explicit reason there is none.
 *
 * One `Panel` with a switched body rather than three panels, because the P0
 * yield field sits at a fixed position beneath that body: entering a rate
 * flips the status from `needs-extraction-rate` to `costed`, and three
 * separate returns would unmount the field mid-keystroke and drop focus after
 * the first digit.
 */
export function PlanVerdict({
  result,
  targetTier,
  targetName,
  unitsPerDay,
  factoryPins,
  hubName,
  pricesFetchedAt,
  extractionRateField,
}: PlanVerdictProps) {
  const { t } = useTranslation();

  const breakdown = result.status === 'costed' ? result.breakdown : null;
  const tax = breakdown ? taxSplit(breakdown, targetTier) : null;
  const marginPerDay = breakdown ? breakdown.margin * unitsPerDay : 0;

  let body: ReactNode;
  if (result.status === 'needs-extraction-rate') {
    body = (
      <div className="p-3">
        <h3 className="text-sm font-semibold text-warning">{t('piPlan.needsRateTitle')}</h3>
        <p className="mt-1 text-xs text-text-dim">{t('piPlan.needsRateHint')}</p>
        <ul className="mt-3 space-y-0.5 text-xs text-text-dim tabular-nums">
          {result.p0PerHour.map((line) => (
            <li key={line.typeId}>
              {t('piPlan.needsRateLine', {
                name: line.name,
                amount: PER_HOUR_FORMAT.format(line.unitsPerHour),
              })}
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (breakdown === null || tax === null) {
    const names =
      result.status === 'not-priceable'
        ? result.missing.map((line) => line.name).join(', ')
        : targetName;
    body = (
      <EmptyState
        title={t('piPlan.notPriceableTitle')}
        hint={t('piPlan.notPriceableHint', { hub: hubName, names })}
        className="py-6"
      />
    );
  } else {
    body = (
      <>
        <div className="divide-y divide-line">
          <LedgerRow label={t('piPlan.revenue')} value={formatIsk(breakdown.revenue)} />
          <LedgerRow label={t('piPlan.inputCost')} value={formatIsk(-breakdown.sourcedCost)} />
          <LedgerRow label={t('piPlan.customsIn')} value={formatIsk(-tax.importCost)} />
          <LedgerRow label={t('piPlan.customsOut')} value={formatIsk(-tax.exportCost)} />
          <LedgerRow
            label={t('piPlan.customsBetween')}
            value={formatIsk(-tax.betweenPlanetsCost)}
            tooltip={t('piPlan.customsBetweenTooltip')}
          />
          <LedgerRow
            label={t('piPlan.planetsTaxed')}
            value={breakdown.planetCount}
            tooltip={t('piPlan.planetsTaxedTooltip')}
          />
          <LedgerRow
            label={t('piPlan.totalCost')}
            value={formatIsk(-breakdown.totalCost)}
            tooltip={t('piPlan.totalCostTooltip')}
          />
          <LedgerRow
            label={t('piPlan.marginPerUnit')}
            value={formatIsk(breakdown.margin)}
            tone={iskTone(breakdown.margin)}
            emphasized
          />
          <LedgerRow
            label={t('piPlan.marginPerDay')}
            value={formatIsk(marginPerDay)}
            tone={iskTone(marginPerDay)}
            emphasized
          />
        </div>
        {breakdown.sourcingFloor === 'P0' && (
          <p className="border-t border-line px-2.5 py-2 text-xs text-text-dim">
            {t('piPlan.p0MarketNote')}
          </p>
        )}
      </>
    );
  }

  return (
    <Panel
      title={t('piPlan.verdictTitle')}
      padded={false}
      actions={
        <>
          <Footprint
            factoryPins={factoryPins}
            extractors={breakdown?.extraction?.totalExtractors ?? null}
          />
          {pricesFetchedAt && <DataAgeBadge date={pricesFetchedAt} />}
        </>
      }
    >
      {body}
      {extractionRateField && (
        <div className="max-w-xs border-t border-line px-2.5 py-2">{extractionRateField}</div>
      )}
    </Panel>
  );
}

interface PlanChainTableProps {
  rows: PlanRow[];
  productName: string;
}

/** The expanded chain: what each tier needs per hour, what it costs in pins, and what the hub says about it. */
export function PlanChainTable({ rows, productName }: PlanChainTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<DataTableColumn<PlanRow>[]>(
    () => [
      {
        id: 'commodity',
        header: t('piPlan.column.commodity'),
        // Titles the card below `sm`: the tier chip carries the hierarchy that
        // indentation carries on desktop, so no depth gutter is spent at 390px.
        primary: true,
        render: (row) => row.name,
      },
      {
        id: 'tier',
        header: t('piPlan.column.tier'),
        render: (row) => (
          <span className="rounded-xs border border-line bg-panel-2 px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wider text-text-dim uppercase">
            {t('piPlan.tierChip', { tier: row.tier })}
          </span>
        ),
      },
      {
        id: 'needPerHour',
        header: t('piPlan.column.needPerHour'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.unitsPerHour,
        render: (row) => PER_HOUR_FORMAT.format(row.unitsPerHour),
      },
      {
        id: 'pins',
        header: t('piPlan.column.pins'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.factoryPins ?? undefined,
        render: (row) => (row.factoryPins == null ? '—' : row.factoryPins),
      },
      {
        id: 'unitPrice',
        header: t('piPlan.column.unitPrice'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.unitPrice ?? undefined,
        render: (row) => (row.unitPrice == null ? '—' : formatIsk(row.unitPrice, 2)),
      },
      {
        id: 'read',
        header: t('piPlan.column.read'),
        render: (row) => (
          <span className="flex items-center gap-1.5">
            <span className={row.role === 'make' ? 'text-accent' : 'text-text-dim'}>
              {row.role === 'make' ? t('piPlan.roleMake') : t('piPlan.roleBuy')}
            </span>
            <span className="text-text-dim">
              {row.read === null
                ? t('piPlan.readUnknown')
                : row.read === 'make'
                  ? t('piPlan.readMake')
                  : t('piPlan.readBuy')}
            </span>
          </span>
        ),
      },
      {
        id: 'valueAdd',
        header: t('piPlan.column.valueAdd'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (row) =>
          row.valueAddPerHour == null ? undefined : iskToneClass(row.valueAddPerHour),
        sortValue: (row) => row.valueAddPerHour ?? undefined,
        render: (row) => (row.valueAddPerHour == null ? '—' : formatIsk(row.valueAddPerHour, 2)),
      },
    ],
    [t]
  );

  return (
    <Panel title={t('piPlan.chainTitle')} padded={false}>
      <p className="flex items-start gap-1.5 border-b border-line px-3 py-2 text-xs text-text-dim">
        {t('piPlan.readTooltip')}
      </p>
      <DataTable
        label={t('piPlan.chainTableLabel', { product: productName })}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.typeId}
        density="compact"
      />
    </Panel>
  );
}

interface PlanSensitivityProps {
  grid: SensitivityRow[];
  rates: number[];
}

/**
 * Margin per floor across a spread of customs rates.
 *
 * A row per floor rather than per rate, so the footprint sits beside the
 * margins it buys — and because that is the orientation `DataTable`'s stacking
 * survives: each card is titled by its floor, with one labelled line per rate.
 */
export function PlanSensitivity({ grid, rates }: PlanSensitivityProps) {
  const { t } = useTranslation();
  const footprintText = useFootprintText();

  const columns = useMemo<DataTableColumn<SensitivityRow>[]>(() => {
    const floorColumn: DataTableColumn<SensitivityRow> = {
      id: 'floor',
      header: t('piPlan.floorColumn'),
      primary: true,
      render: (row) => t(`piPlan.floorOption.${row.floor}` as const),
    };
    const footprintColumn: DataTableColumn<SensitivityRow> = {
      id: 'footprint',
      header: t('piPlan.footprintLabel'),
      className: 'text-text-dim tabular-nums',
      render: (row) => footprintText(row.factoryPins, row.extractors),
    };
    const rateColumns: DataTableColumn<SensitivityRow>[] = rates.map((rate, index) => ({
      id: `rate-${index}`,
      header: t('piPlan.rateColumn', { percent: formatRate(rate) }),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => {
        const cell = row.cells[index];
        if (!cell) return '—';
        if (cell.status !== 'costed') {
          return cell.status === 'needs-extraction-rate'
            ? t('piPlan.cellNeedsRate')
            : t('piPlan.cellNotPriceable');
        }
        return (
          <span
            className={
              cell.best ? `font-semibold ${iskToneClass(cell.margin)}` : iskToneClass(cell.margin)
            }
          >
            {cell.best && (
              <>
                {/* The glyph is decorative; the words are what a screen reader
                    reads, so the marker is never colour-and-shape alone. */}
                <span aria-hidden="true">★ </span>
                <span className="sr-only">{t('piPlan.bestFloor')}: </span>
              </>
            )}
            {formatIsk(cell.margin)}
          </span>
        );
      },
    }));
    return [floorColumn, footprintColumn, ...rateColumns];
  }, [t, rates, footprintText]);

  return (
    <Panel title={t('piPlan.sensitivityTitle')} padded={false}>
      <p className="border-b border-line px-3 py-2 text-xs text-text-dim">
        {t('piPlan.sensitivityHint')}
      </p>
      <DataTable
        label={t('piPlan.sensitivityTableLabel')}
        columns={columns}
        rows={grid}
        rowKey={(row: SensitivityRow) => row.floor as SourcingFloor}
        density="compact"
      />
    </Panel>
  );
}
