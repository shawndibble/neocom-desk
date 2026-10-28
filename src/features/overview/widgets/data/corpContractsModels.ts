/**
 * Corp contracts builder: outstanding courier and item-exchange contracts, the
 * ones expiring soon and the courier collateral at stake. Same contract as
 * `models.ts`: pure, derived at render time.
 *
 * The clocks come from the character contracts engine's rules
 * (`engine/contracts/corpContracts.ts`). ESI caches the list for 300 s, so no
 * countdown is drawn finer than that.
 */
import type { DeadlineSeverity } from '@/engine/character/severity';
import { summarizeCorpContracts, type CorpContractRow } from '@/engine/contracts/corpContracts';
import { CONTRACT_TYPE_KEY } from '@/features/character/contractLabels';
import { formatIskCompact } from '@/lib/isk';
import { formatCountdown } from '@/lib/duration';
import { openHref } from '@/lib/highlightParam';
import { blank, corpUnreadable, count, statusOf, UNKNOWN, type Builder } from './builderKit';
import type { TableCell, TableRowModel, Translate } from './types';

const C = 'overview.widgets.corpContracts';
/** The Contracts page's Corp view, where a member with no corp role reads the same list. */
const TO = '/contracts/history?scope=corp';
/** The corp contracts read's cache window: a clock under it would tick past what ESI knows. */
const CACHE_WINDOW_MS = 300_000;

function toneOf(row: CorpContractRow): DeadlineSeverity {
  if (row.overdue) return 'critical';
  return row.expiringSoon ? 'warning' : 'clear';
}

function clock(row: CorpContractRow, now: number, t: Translate): string {
  const remainingMs = row.atMs - now;
  if (remainingMs <= 0) return t(`${C}.overdue`);
  return remainingMs < CACHE_WINDOW_MS ? t(`${C}.underCache`) : formatCountdown(remainingMs / 1000);
}

export const corpContracts: Builder = (feeds, { t, now }) => {
  const feed = feeds.corpContracts;
  const data = feed?.data ?? null;
  if (!data) return blank(TO, statusOf(feed));
  if (!data.readable) return corpUnreadable(TO, feed, data.needsReauth, t);

  const summary = summarizeCorpContracts(data.contracts, now);
  const { rows } = summary;
  const nameOf = (id: number) => data.names.get(id) ?? (id > 0 ? `#${id}` : UNKNOWN);
  const labelOf = (row: CorpContractRow) =>
    row.title ?? t(`${C}.untitled`, { type: t(CONTRACT_TYPE_KEY[row.type]), id: row.contractId });
  const collateralCell = (row: CorpContractRow): TableCell =>
    row.type === 'courier' && row.collateral !== null && row.collateral > 0
      ? { text: formatIskCompact(row.collateral), iskAmount: row.collateral }
      : UNKNOWN;

  return {
    ...blank(TO, statusOf(feed, { isEmpty: rows.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: count(summary.outstanding),
      unit: t(`${C}.unit`),
      secondary:
        summary.expiringSoon > 0
          ? { text: t(`${C}.expiringSoon`, { count: summary.expiringSoon }), tone: 'caution' }
          : undefined,
      notes:
        summary.collateral > 0
          ? [t(`${C}.collateral`, { amount: formatIskCompact(summary.collateral) })]
          : undefined,
      tone: summary.overdue > 0 ? 'critical' : summary.expiringSoon > 0 ? 'warning' : 'clear',
    },
    rows: rows.map((row) => ({
      key: String(row.contractId),
      title: labelOf(row),
      detail: t(CONTRACT_TYPE_KEY[row.type]),
      value: clock(row, now, t),
      tone: toneOf(row),
    })),
    table: {
      columns: [
        { key: 'contract', label: t(`${C}.col.contract`), priority: 0, grow: true },
        { key: 'expiry', label: t(`${C}.col.expiry`), align: 'end', priority: 1 },
        { key: 'type', label: t(`${C}.col.type`), priority: 2, hideNarrow: true },
        { key: 'issuer', label: t(`${C}.col.issuer`), priority: 3, hideNarrow: true },
        { key: 'assignee', label: t(`${C}.col.assignee`), priority: 4, hideNarrow: true },
        { key: 'collateral', label: t(`${C}.col.collateral`), align: 'end', priority: 5 },
      ],
      rows: rows.map((row): TableRowModel => ({
        key: String(row.contractId),
        cells: [
          labelOf(row),
          clock(row, now, t),
          t(CONTRACT_TYPE_KEY[row.type]),
          nameOf(row.issuerId),
          nameOf(row.assigneeId),
          collateralCell(row),
        ],
        tone: toneOf(row),
        to: openHref(TO, row.contractId),
      })),
    },
    summary: t(`${C}.summary`, {
      count: summary.outstanding,
      soon: summary.expiringSoon,
    }),
  };
};
