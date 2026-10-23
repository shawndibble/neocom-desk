/**
 * Corp SRP builder: the open SRP Claims for an officer. Number is the
 * Pending count with the ISK owed (Approved, not yet Paid); Table lists the open claims. Same
 * contract as `models.ts`: pure, derived at render time.
 */
import { formatIsk } from '@/lib/isk';
import { formatNumber } from '@/lib/numberLocale';
import { blank, corpUnreadable, statusOf, UNKNOWN, type Builder } from './builderKit';
import type { CorpSrpFeed, SrpClaimRow } from './corpFeeds';
import type { TableCell, TableRowModel } from './types';

const C = 'overview.widgets.corpSrp';
/** The SRP page (ships in its own ticket) and its settings, where a Director turns SRP on. */
const SRP_PATH = '/corp/srp';
const SETTINGS_PATH = '/corp/srp';

const RANK: Record<SrpClaimRow['state'], number> = {
  pending: 0,
  approved: 1,
  paid: 2,
  rejected: 3,
};

/** Pending first (the queue an officer works), then Approved awaiting payment; oldest first in each. */
const ordered = (claims: readonly SrpClaimRow[]): SrpClaimRow[] =>
  [...claims].sort((a, b) => RANK[a.state] - RANK[b.state] || a.filedAt - b.filedAt);

const isk = (amount: number, t: (k: string) => string) =>
  `${formatIsk(amount)} ${t('overview.isk')}`;

function killmailName(claim: SrpClaimRow, data: CorpSrpFeed): string {
  const hull = data.typeNames.get(claim.hullTypeId);
  const system = data.systemNames.get(claim.solarSystemId);
  const parts = [hull, system].filter((p): p is string => p !== undefined);
  return parts.length === 0 ? `#${claim.killmailId}` : parts.join(', ');
}

export const corpSrp: Builder = (feeds, { t }) => {
  const feed = feeds.corpSrp;
  const data = feed?.data ?? null;
  if (!data) return blank(SRP_PATH, statusOf(feed));
  if (!data.readable) return corpUnreadable(null, feed, data.needsReauth, t);

  if (!data.enabled) {
    return {
      ...blank(data.canSetUp ? SETTINGS_PATH : null, statusOf(feed, { isEmpty: true })),
      fetchedAt: data.fetchedAt,
      emptyMessage: t(`${C}.off`),
      emptyHint: t(data.canSetUp ? `${C}.offHintDirector` : `${C}.offHintOfficer`),
      emptyLinkLabel: data.canSetUp ? t(`${C}.setUp`) : undefined,
    };
  }

  const claims = ordered(data.claims);
  const pending = claims.filter((c) => c.state === 'pending').length;
  const owed = claims.reduce((sum, c) => (c.state === 'approved' ? sum + (c.amount ?? 0) : sum), 0);
  const owedText = isk(owed, t);

  const amountCell = (c: SrpClaimRow): TableCell =>
    c.amount === null ? UNKNOWN : { text: isk(c.amount, t), iskAmount: c.amount };

  return {
    ...blank(SRP_PATH, statusOf(feed, { isEmpty: claims.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: formatNumber(pending),
      unit: t(`${C}.unit`, { count: pending }),
      secondary:
        owed > 0 ? { text: t(`${C}.owed`, { amount: owedText }), tone: 'caution' } : undefined,
      notes: owed > 0 ? [t(`${C}.owedNote`)] : undefined,
      tone: 'clear',
      link: { label: t(`${C}.review`), to: SRP_PATH },
    },
    table: {
      columns: [
        { key: 'pilot', label: t(`${C}.col.pilot`), nameFloor: true, priority: 0, minWidth: 100 },
        {
          key: 'kill',
          label: t(`${C}.col.killmail`),
          grow: true,
          priority: 3,
          minWidth: 105,
        },
        { key: 'amount', label: t(`${C}.col.amount`), align: 'end', priority: 1, minWidth: 56 },
        { key: 'status', label: t(`${C}.col.status`), priority: 2, minWidth: 56 },
      ],
      fitWidth: true,
      footer: owed > 0 ? t(`${C}.footer`, { amount: owedText }) : undefined,
      rows: claims.map((c): TableRowModel => ({
        key: String(c.killmailId),
        cells: [
          c.characterName ?? UNKNOWN,
          killmailName(c, data),
          amountCell(c),
          c.state === 'pending'
            ? { text: t(`${C}.status.pending`), tone: 'caution' }
            : t(`${C}.status.approved`),
        ],
        to: SRP_PATH,
      })),
    },
    summary: t(`${C}.summary`, { count: pending, owed: owedText }),
    emptyMessage: t(`${C}.empty`),
    emptyHint: t(`${C}.emptyHint`),
    emptyLinkLabel: t(`${C}.open`),
  };
};
