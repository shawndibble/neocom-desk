import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Caret,
  Checkbox,
  DataTableDenseCell,
  IskAmount,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import {
  focusRingClassName,
  interactiveClassName,
  touchCheckboxLabelClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { STATUS_LABEL_KEY, type MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import { SecurityValue } from '@/features/assets/assetBrowserRows';
import { allMembers, type DisplayRow, type GroupMember } from '@/features/miningTax/groupRows';
import {
  dateLabel,
  dateRangeOf,
  oreTypeIdsOf,
  shortDateLabel,
  taxOwedOf,
} from '@/features/miningTax/taxRowFormat';
import { StatusPill } from '@/features/miningTax/StatusPill';
import { CorpStatusPill } from '@/features/miningTax/corpBook/CorpStatusPill';
import { CorpCorrectedAmount, CorpOverlapMark } from '@/features/miningTax/corpBook/CorpLineMarks';
import type { CorpRowInfo } from '@/features/miningTax/corpBook/corpRows';
import { isBookRow } from '@/features/miningTax/corpBook/corpRows';
import { OreIcon } from './OreIcon';
import { formatCount } from '@/lib/formatCount';

/** The tick-box column (and History's matching spacer): little room left of the box, the date cell's own padding as the gap after it. */
const SELECT_COLUMN_CLASS = 'w-9 pl-2 pr-0';

/** Structural, not i18next's TFunction, so this stays easy to pass around without fighting its generics. */
export function statusLabel(t: (key: string) => string, status: MiningTaxRowStatus): string {
  return t(`miningTax.status.${STATUS_LABEL_KEY[status]}`);
}

/**
 * The select column only shows with something selectable on screen
 * (nothing Outstanding to bulk-pay, nothing Unassigned to combine or
 * dismiss) — an always-blank leading column reads as unexplained
 * whitespace before Date. Both actions share one checkbox column.
 */
export const isSelectableRow = (dr: DisplayRow) =>
  !isBookRow(dr) &&
  ((dr.status === 'outstanding' && dr.assignment !== null) || dr.status === 'unassigned');

interface UseTaxColumnsInput {
  isPhone: boolean;
  showOreColumn: boolean;
  showValueColumn: boolean;
  showCharacterColumn: boolean;
  showSelectColumn: boolean;
  typeNames: ReadonlyMap<number, string> | undefined;
  systemSecurity: ReadonlyMap<number, number> | undefined;
  selection: ReadonlySet<string>;
  expandedCombined: ReadonlySet<string>;
  toggleRowSelected: (key: string) => void;
  toggleCombinedExpanded: (key: string) => void;
  estimatedValueOf: (dr: DisplayRow) => number;
  systemName: (dr: DisplayRow) => string;
  payeeDisplayName: (dr: DisplayRow) => string;
  corpStateLabel: (corp: CorpRowInfo) => string;
  /** `statusColumnWidthClass` for the rows on screen, both tables' together so their columns line up. */
  statusWidthClass: string;
}

/**
 * The Open and History tables' column sets. `baseColumns` is what both share;
 * Open adds the select column, History an equal-width spacer so the two
 * fixed-layout tables line up. Memoised on what the cells actually read, so a
 * toast or dialog change hands the tables the very same arrays.
 */
export function useTaxColumns({
  isPhone,
  showOreColumn,
  showValueColumn,
  showCharacterColumn,
  showSelectColumn,
  typeNames,
  systemSecurity,
  selection,
  expandedCombined,
  toggleRowSelected,
  toggleCombinedExpanded,
  estimatedValueOf,
  systemName,
  payeeDisplayName,
  corpStateLabel,
  statusWidthClass,
}: UseTaxColumnsInput) {
  const { t } = useTranslation();
  return useMemo(() => {
    const systemSecurityOf = (dr: DisplayRow): number | undefined =>
      systemSecurity?.get(dr.row.entry.solarSystemId);
    /**
     * A cell's figure, with a combined row's per-day lines under it once
     * expanded. Plain text otherwise: the dense phone card prints cells inline
     * on its meta line, where a block would break the line apart.
     */
    function withDayLines(
      dr: DisplayRow,
      main: ReactNode,
      render: (member: GroupMember) => ReactNode
    ) {
      const days = dayLines(dr, render);
      if (!days) return main;
      return (
        <span className="block">
          <span className="block h-5 leading-5">{main}</span>
          {days}
        </span>
      );
    }

    /** A combined row's per-day lines, shown under its total when expanded (desktop only — the phone card keeps its two lines). */
    function dayLines(dr: DisplayRow, render: (member: GroupMember) => ReactNode) {
      if (!dr.groupMembers || !expandedCombined.has(dr.key)) return null;
      return allMembers(dr)
        .sort((a, b) => a.row.entry.date.localeCompare(b.row.entry.date))
        .map((member) => (
          <span
            key={member.assignment.id}
            className="hidden text-[0.6875rem] leading-5 text-text-dim sm:block"
          >
            {render(member)}
          </span>
        ));
    }

    const oreColumn: DataTableColumn<DisplayRow> = {
      id: 'ore',
      headerCellClassName: 'sm:w-40',
      header: t('miningTax.oreColumn'),
      render: (dr) =>
        withDayLines(
          dr,
          dr.groupMembers ? (
            <span className="inline-flex text-[0.6875rem] font-semibold tracking-wider text-text-dim uppercase">
              {t('miningTax.combined.days', { count: allMembers(dr).length })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5">
              {oreTypeIdsOf(dr)
                .slice(0, 5)
                .map((typeId) => (
                  <Tooltip key={typeId} content={typeNames?.get(typeId) ?? `#${typeId}`}>
                    <span tabIndex={0}>
                      <OreIcon typeId={typeId} size={32} className="h-4 w-4" />
                    </span>
                  </Tooltip>
                ))}
            </span>
          ),
          (m) => (
            <span className="block max-w-[12rem] truncate">
              {m.assignment.oreLines
                .map(
                  (line) =>
                    `${typeNames?.get(line.typeId) ?? `#${line.typeId}`} ${formatCount(line.quantity)}`
                )
                .join(' · ')}
            </span>
          )
        ),
    };

    const valueColumn: DataTableColumn<DisplayRow> = {
      id: 'value',
      headerCellClassName: 'sm:w-32',
      header: t('miningTax.estimatedValueColumn'),
      align: 'right',
      className: 'whitespace-nowrap',
      stackAffix: { after: ` ${t('miningTax.valueAffix')}` },
      // Compact on a phone card, where it shares one meta line with the
      // system, the Payee and the status.
      render: (dr) =>
        withDayLines(
          dr,
          estimatedValueOf(dr) <= 0 ? (
            // Zero or unpriced: a muted dash, left off the phone card's meta line
            // rather than printing "· — value" on every row.
            <span className="text-text-dim" data-dense-omit>
              <span aria-hidden="true">—</span>
              <span className="sr-only">{t('miningTax.noPriceLabel')}</span>
            </span>
          ) : isPhone ? (
            <IskAmount value={estimatedValueOf(dr)} />
          ) : (
            `${formatIsk(estimatedValueOf(dr))} ISK`
          ),
          (m) => `${formatIsk(m.assignment.estimatedValue)} ISK`
        ),
      sortValue: (dr) => estimatedValueOf(dr),
    };

    const baseColumns: DataTableColumn<DisplayRow>[] = [
      ...(showCharacterColumn
        ? [
            {
              id: 'character',
              headerCellClassName: 'sm:w-28',
              header: t('miningTax.characterColumn'),
              // Plain: the row opens the detail modal, which links the pilot (§6c).
              render: (dr: DisplayRow) => <span>{dr.row.characterName}</span>,
              sortValue: (dr: DisplayRow) => dr.row.characterName,
            } satisfies DataTableColumn<DisplayRow>,
          ]
        : []),
      {
        id: 'date',
        headerCellClassName: 'sm:w-36',
        header: t('miningTax.dateColumn'),
        headerTooltip: t('miningTax.dateEveHint'),
        className: 'whitespace-nowrap',
        // Row opens its detail modal: the accent primary cell is the cue (§6c).
        cellClassName: () => 'text-accent',
        render: (dr) =>
          withDayLines(
            dr,
            <span className="relative inline-flex items-center">
              {dr.groupMembers && (
                <button
                  type="button"
                  aria-expanded={expandedCombined.has(dr.key)}
                  aria-label={t('miningTax.combined.showDays', { date: dateLabel(dr) })}
                  onClick={() => toggleCombinedExpanded(dr.key)}
                  // In the gutter left of the date, so a combined row's date
                  // keeps the same left edge as every other row's.
                  className={cx(
                    'absolute top-0 -left-5 hidden size-5 items-center justify-center rounded-xs text-text-dim hover:text-accent sm:inline-flex',
                    interactiveClassName,
                    focusRingClassName
                  )}
                >
                  <Caret expanded={expandedCombined.has(dr.key)} />
                </button>
              )}
              {shortDateLabel(dr)}
              {isPhone && dr.groupMembers && (
                <span className="ml-1.5 text-[0.6875rem] font-semibold tracking-wider text-accent uppercase">
                  {t('miningTax.combined.days', { count: allMembers(dr).length })}
                </span>
              )}
            </span>,
            (m) => <span className="pl-3">{m.row.entry.date}</span>
          ),
        sortValue: (dr) => dateRangeOf(dr)[0],
        primary: true,
      },
      {
        id: 'system',
        headerCellClassName: 'sm:w-24',
        header: t('miningTax.systemColumn'),
        render: (dr) => (
          <DataTableDenseCell>
            <span>{systemName(dr)}</span>
            <SecurityValue security={systemSecurityOf(dr)} />
          </DataTableDenseCell>
        ),
        sortValue: (dr) => systemName(dr),
      },
      {
        id: 'payee',
        header: t('miningTax.payeeColumn'),
        // The one column without a fixed width (both tables are `table-fixed`),
        // so it takes whatever the others leave — room for "Bureau of Unified
        // Harvesting" — and truncates rather than pushing Status off-screen at
        // 1024px. `sm:`-scoped so the phone card shows the whole name.
        className: 'sm:truncate',
        render: (dr) => {
          const name = payeeDisplayName(dr);
          return (
            <HintText
              content={dr.assignment?.label ? `${name} · ${dr.assignment.label}` : name}
              desktopOnly
              onlyWhenTruncated
            >
              {name}
              {dr.assignment?.label && (
                <span className="text-text-dim"> · {dr.assignment.label}</span>
              )}
            </HintText>
          );
        },
        sortValue: (dr) => payeeDisplayName(dr),
      },
      ...(showOreColumn ? [oreColumn] : []),
      ...(showValueColumn ? [valueColumn] : []),
      {
        id: 'taxOwed',
        headerCellClassName: 'sm:w-28',
        header: t('miningTax.taxOwedColumn'),
        align: 'right',
        className: 'whitespace-nowrap',
        cardCorner: true,
        // Owed is the figure the page is about; settled history recedes.
        cellClassName: (dr) =>
          dr.corp?.kind === 'row' && dr.corp.view.state === 'conflict'
            ? 'text-text-dim'
            : dr.status === 'outstanding' && taxOwedOf(dr) <= 0
              ? 'text-text-dim'
              : dr.status === 'outstanding'
                ? 'text-isk-neg'
                : dr.status === 'paid' || dr.status === 'dismissed'
                  ? 'text-text-dim font-normal'
                  : undefined,
        render: (dr) =>
          dr.assignment && !(dr.corp?.kind === 'row' && dr.corp.view.taxOwed === null)
            ? withDayLines(
                dr,
                dr.corp?.kind === 'row' && dr.corp.view.correction ? (
                  // A correction keeps the old figure on the line (#4622).
                  <CorpCorrectedAmount correction={dr.corp.view.correction}>
                    {`${formatIsk(taxOwedOf(dr))} ISK`}
                  </CorpCorrectedAmount>
                ) : (
                  `${formatIsk(taxOwedOf(dr))} ISK`
                ),
                (m) => `${formatIsk(m.assignment.taxOwed)} ISK`
              )
            : '—',
        sortValue: (dr) => (dr.assignment ? taxOwedOf(dr) : undefined),
      },
      {
        id: 'status',
        headerCellClassName: statusWidthClass,
        // Centred on a table, where the pill would otherwise sit at the left of
        // a column wider than it; the phone card places it on its own line.
        align: isPhone ? undefined : 'center',
        header: t('miningTax.statusColumn'),
        // Closes the phone card's second line at its right edge, so every
        // status sits in one column under the tax figure above it.
        stackEdge: 'end',
        render: (dr) =>
          dr.corp ? (
            <>
              <CorpStatusPill corp={dr.corp} />
              {dr.corp.kind === 'row' && dr.corp.view.overlap && <CorpOverlapMark />}
            </>
          ) : (
            <StatusPill
              status={dr.status}
              label={statusLabel(t, dr.status)}
              hint={dr.status === 'needs-review' ? t('miningTax.needsReviewHint') : undefined}
            />
          ),
        sortValue: (dr) => (dr.corp ? corpStateLabel(dr.corp) : statusLabel(t, dr.status)),
      },
    ];

    const openColumns: DataTableColumn<DisplayRow>[] = [
      ...(showSelectColumn
        ? [
            {
              id: 'select',
              header: '',
              className: SELECT_COLUMN_CLASS,
              headerCellClassName: 'sm:w-9',
              stackEdge: 'start',
              render: (dr: DisplayRow) =>
                isSelectableRow(dr) ? (
                  // The label is the 44px touch target on a coarse pointer; it grows the cell, never overlays a neighbour.
                  <label className={touchCheckboxLabelClassName}>
                    <Checkbox
                      aria-label={t('miningTax.selectRow', {
                        date: dateLabel(dr),
                        system: systemName(dr),
                      })}
                      checked={selection.has(dr.key)}
                      onChange={() => toggleRowSelected(dr.key)}
                    />
                  </label>
                ) : null,
            } satisfies DataTableColumn<DisplayRow>,
          ]
        : []),
      ...baseColumns,
    ];

    // History has no checkboxes, but keeps an empty column the same width so
    // its columns sit exactly under Open's (both tables are fixed-layout). Not
    // on a phone: there it would be one more (empty) value on the card's meta
    // line, opening it with a stray "·".
    const historyColumns: DataTableColumn<DisplayRow>[] = [
      ...(showSelectColumn && !isPhone
        ? [
            {
              id: 'spacer',
              header: '',
              className: SELECT_COLUMN_CLASS,
              headerCellClassName: 'sm:w-9',
              render: () => null,
            } satisfies DataTableColumn<DisplayRow>,
          ]
        : []),
      ...baseColumns,
    ];
    return { baseColumns, openColumns, historyColumns };
  }, [
    t,
    isPhone,
    showOreColumn,
    showValueColumn,
    showCharacterColumn,
    showSelectColumn,
    typeNames,
    systemSecurity,
    selection,
    expandedCombined,
    toggleRowSelected,
    toggleCombinedExpanded,
    estimatedValueOf,
    systemName,
    payeeDisplayName,
    corpStateLabel,
    statusWidthClass,
  ]);
}
