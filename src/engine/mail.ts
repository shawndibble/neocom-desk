/**
 * Buckets mail headers into System Label tabs (CONTEXT.md round 18). ESI
 * documents no fixed `label_id` numbers for the four built-in labels, so
 * categorization goes by the `name` each `/mail/labels/` entry already
 * carries ("Inbox"/"Sent"/"Corp"/"Alliance") rather than a guessed id — a
 * name that doesn't match one of the four just isn't in the map, which is
 * what makes "unrecognized folds into Inbox" fall out of `resolveMailTab`'s
 * default without a special case.
 */

export type MailTab = 'inbox' | 'sent' | 'corp' | 'alliance';

interface SystemLabel {
  label_id: number;
  name?: string;
  unread_count?: number;
}

const NAME_TO_TAB: Readonly<Record<string, MailTab>> = {
  inbox: 'inbox',
  sent: 'sent',
  corp: 'corp',
  alliance: 'alliance',
};

/**
 * A header carrying more than one recognized System Label needs one
 * canonical tab (AC: "one row, one tag"). Sent takes priority since it
 * reflects the character's own action; Alliance over Corp as the more
 * specific audience. ESI does not guarantee `labels` array order.
 */
const TAB_PRECEDENCE: readonly MailTab[] = ['sent', 'alliance', 'corp', 'inbox'];

/** `label_id -> MailTab` for whichever of the four System Labels are present in this response. */
export function buildLabelTabMap(labels: readonly SystemLabel[]): ReadonlyMap<number, MailTab> {
  const map = new Map<number, MailTab>();
  for (const label of labels) {
    const tab = label.name ? NAME_TO_TAB[label.name.trim().toLowerCase()] : undefined;
    if (tab) map.set(label.label_id, tab);
  }
  return map;
}

/** One canonical tab for a header's `labels` ids; no recognized System Label (or none at all) folds into Inbox. */
export function resolveMailTab(
  labelIds: readonly number[] | undefined,
  labelTabById: ReadonlyMap<number, MailTab>
): MailTab {
  const tabs = new Set(
    (labelIds ?? [])
      .map((id) => labelTabById.get(id))
      .filter((tab): tab is MailTab => tab !== undefined)
  );
  for (const tab of TAB_PRECEDENCE) {
    if (tabs.has(tab)) return tab;
  }
  return 'inbox';
}

/**
 * Per-tab unread badge counts, straight from each System Label's own
 * `unread_count` (CONTEXT.md: "used as-is, not computed client-side") — the
 * All tab's count is `total_unread_count` on the labels response itself, not
 * a sum of these, since the two can differ once Custom Labels exist.
 */
export function unreadCountsByTab(labels: readonly SystemLabel[]): ReadonlyMap<MailTab, number> {
  const map = new Map<MailTab, number>();
  for (const label of labels) {
    const tab = label.name ? NAME_TO_TAB[label.name.trim().toLowerCase()] : undefined;
    if (tab) map.set(tab, label.unread_count ?? 0);
  }
  return map;
}

interface MailHeaderLike {
  mail_id: number;
}

export interface MergedMailHeaderPage<H extends MailHeaderLike> {
  headers: H[];
  /** True when `page` came back at `pageSize` — ESI gives no total count, so a full page is the only "more may exist" signal available. */
  hasMore: boolean;
}

/** ESI's per-call cap on `/characters/{id}/mail` (both the uncursored and `last_mail_id` cursored calls). */
export const MAIL_HEADERS_PAGE_SIZE = 50;

/**
 * Folds one more `last_mail_id`-cursored page into the already-loaded list
 * (issue #161: pagination beyond the 50-cap). Dedupes by `mail_id` since
 * `last_mail_id` is documented exclusive but a defensive merge costs nothing
 * and protects against an off-by-one on ESI's side.
 */
export function mergeMailHeaderPage<H extends MailHeaderLike>(
  existing: readonly H[],
  page: readonly H[],
  pageSize: number = MAIL_HEADERS_PAGE_SIZE
): MergedMailHeaderPage<H> {
  const byId = new Map<number, H>(existing.map((header) => [header.mail_id, header]));
  for (const header of page) byId.set(header.mail_id, header);
  return { headers: Array.from(byId.values()), hasMore: page.length >= pageSize };
}

interface MailSearchable {
  subject?: string;
}

/**
 * Subject/sender substring match, case-insensitively (issue #416, reversing
 * CONTEXT.md round 18's "no subject/sender search" — see round 55: "load
 * more" (round 22) plus this ticket's own display cap mean a bucket is no
 * longer necessarily small). A blank query matches everything, so callers can
 * pass the raw (possibly-empty) search box value without a separate branch.
 */
export function mailSearchMatches(
  header: MailSearchable,
  senderName: string | undefined,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if ((header.subject ?? '').toLowerCase().includes(q)) return true;
  return (senderName ?? '').toLowerCase().includes(q);
}

/** Rendered header-list cap (issue #416): "load more" can accumulate far past what's worth rendering as DOM rows. */
export const MAIL_HEADER_DISPLAY_CAP = 200;

export interface CappedHeaders<H> {
  headers: H[];
  /** True when the input list held more than `cap` and was cut down. */
  truncated: boolean;
}

/**
 * Truncates an already-ordered header list to the first `cap` entries. Order
 * is the caller's responsibility (Mail.tsx sorts newest-first before this),
 * not re-derived here — this is a display cap, not a recency policy.
 */
export function capHeadersForDisplay<H>(
  headers: readonly H[],
  cap: number = MAIL_HEADER_DISPLAY_CAP
): CappedHeaders<H> {
  if (headers.length <= cap) return { headers: [...headers], truncated: false };
  return { headers: headers.slice(0, cap), truncated: true };
}
