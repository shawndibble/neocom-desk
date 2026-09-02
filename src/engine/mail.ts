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
