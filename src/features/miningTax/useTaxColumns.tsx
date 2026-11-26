import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Caret,
  Checkbox,
  DataTableDenseCell,
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
import { labelWithoutSystem } from './assignmentLabel';
import { OreIcon } from './OreIcon';
import { formatCount } from '@/lib/formatCount';
import type { TaxColumnId } from './taxColumns';

const SELECT_COLUMN_CLASS = 'w-9 pl-2 pr-0';

export function statusLabel(t: (key: string) => string, status: MiningTaxRowStatus): string {
  return t(`miningTax.status.${STATUS_LABEL_KEY[status]}`);
}

export const isSelectableRow = (dr: DisplayRow) =>
  !isBookRow(dr) &&
  ((dr.status === 'outstanding' && dr.assignment !== null) || dr.status === 'unassigned');

interface UseTaxColumnsInput {
  isPhone: boolean;
  showOreColumn: boolean;
  showValueColumn: boolean;
  showCharacterColumn: boolean;
  showSelectColumn: boolean;
  visibleColumns: readonly TaxColumnId[];
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
  statusWidthClass: string;
}

export function useTaxColumns({
  isPhone,
  showOreColumn,
  showValueColumn,
  showCharacterColumn,
  showSelectColumn,
  visibleColumns,
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
      render: (dr) =>
        withDayLines(
          dr,
          estimatedValueOf(dr) <= 0 ? (
            <span className="text-text-dim" data-dense-omit>
              <span aria-hidden="true">—</span>
              <span className="sr-only">{t('miningTax.noPriceLabel')}</span>
            </span>
          ) : (
            `${formatIsk(estimatedValueOf(dr))} ISK`
          ),
          (m) => `${formatIsk(m.assignment.estimatedValue)} ISK`
        ),
      sortValue: (dr) => estimatedValueOf(dr),
    };

    const allColumns: DataTableColumn<DisplayRow>[] = [
      ...(showCharacterColumn
        ? [
            {
              id: 'character',
              headerCellClassName: 'sm:w-28',
              header: t('miningTax.characterColumn'),
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
        className: 'sm:truncate',
        render: (dr) => {
          const name = payeeDisplayName(dr);
          const label = dr.assignment?.label
            ? labelWithoutSystem(dr.assignment.label, systemName(dr))
            : dr.corp?.kind === 'row' &&
                dr.corp.view.open === true &&
                dr.corp.view.structureId === undefined
              ? t('miningTax.corpBook.refineryNotRecorded')
              : undefined;
          return (
            <HintText content={label ? `${name} · ${label}` : name} desktopOnly onlyWhenTruncated>
              {name}
              {label && <span className="text-text-dim"> · {label}</span>}
            </HintText>
          );
        },
        sortValue: (dr) => payeeDisplayName(dr),
      },
      ...(showOreColumn ? [oreColumn] : []),
      ...(showValueColumn && !isPhone ? [valueColumn] : []),
      {
        id: 'taxOwed',
        headerCellClassName: 'sm:w-28',
        header: t('miningTax.taxOwedColumn'),
        align: 'right',
        className: 'whitespace-nowrap',
        cardCorner: true,
        cellClassName: (dr) =>
          dr.corp?.kind === 'row' && dr.corp.view.state === 'conflict'
            ? 'text-text-dim'
            : dr.status === 'outstanding' && taxOwedOf(dr) <= 0
              ? 'text-text-dim'
              : dr.status === 'outstanding'
                ? 'text-isk-neg'
                : dr.status === 'paid' || dr.status === 'dismissed' || dr.status === 'tracked'
                  ? 'text-text-dim font-normal'
                  : undefined,
        render: (dr) =>
          dr.corp?.kind === 'row' && dr.corp.view.state === 'conflict' ? (
            <span className="block">
              <span className="block">{`${formatIsk(dr.corp.view.billed)} ISK`}</span>
              <span className="block text-[0.6875rem] font-normal text-warning">
                {t('miningTax.corpBook.conflict.cardBills')}
              </span>
            </span>
          ) : dr.assignment && !(dr.corp?.kind === 'row' && dr.corp.view.taxOwed === null) ? (
            withDayLines(
              dr,
              dr.corp?.kind === 'row' && dr.corp.view.correction ? (
                <CorpCorrectedAmount correction={dr.corp.view.correction}>
                  {`${formatIsk(taxOwedOf(dr))} ISK`}
                </CorpCorrectedAmount>
              ) : (
                `${formatIsk(taxOwedOf(dr))} ISK`
              ),
              (m) => `${formatIsk(m.assignment.taxOwed)} ISK`
            )
          ) : (
            '—'
          ),
        sortValue: (dr) =>
          dr.corp?.kind === 'row' && dr.corp.view.state === 'conflict'
            ? dr.corp.view.billed
            : dr.assignment
              ? taxOwedOf(dr)
              : undefined,
      },
      {
        id: 'status',
        headerCellClassName: statusWidthClass,
        align: isPhone ? undefined : 'center',
        header: t('miningTax.statusColumn'),
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
              hint={
                dr.status === 'needs-review'
                  ? t('miningTax.needsReviewHint')
                  : dr.status === 'tracked'
                    ? t('miningTax.trackedHint')
                    : undefined
              }
            />
          ),
        sortValue: (dr) => (dr.corp ? corpStateLabel(dr.corp) : statusLabel(t, dr.status)),
      },
    ];

    const baseColumns = allColumns.filter(
      (column) => column.id === 'date' || visibleColumns.includes(column.id as TaxColumnId)
    );

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
    return { allColumns, baseColumns, openColumns, historyColumns };
  }, [
    t,
    isPhone,
    showOreColumn,
    showValueColumn,
    showCharacterColumn,
    showSelectColumn,
    visibleColumns,
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
