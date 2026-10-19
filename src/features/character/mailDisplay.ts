import type { TFunction } from 'i18next';
import * as Icon from '@/components/ui/icons';
import { formatMonthLabel } from '@/lib/calendarGrid';
import type { MailAgeBucket } from '@/engine/mail/mailAge';
import type { MailTab } from '@/engine/mail/mail';
import type { MailHeader } from '@/esi/endpoints';

export const TAB_LABEL_KEY: Record<MailTab, string> = {
  inbox: 'mail.tabInbox',
  sent: 'mail.tabSent',
  corp: 'mail.tabCorp',
  alliance: 'mail.tabAlliance',
};

/**
 * The glyph a row wears instead of the old uppercase text tag.
 *
 * A glyph rather than a per-folder colour on purpose (see
 * `docs/context/decisions/`, "Mail rows go two-line"): Inbox/Sent/Corp/
 * Alliance is a *nominal* set — no order, no severity — and every colour scale
 * in this app is ordinal or semantic (`securityStatusColor`, `STANDING_TONE`,
 * the order-problem severity ladder). Four hues here would encode identity
 * alone, which DESIGN.md §6 calls decoration, and in a palette where cyan is
 * already "interactive" they would read as status and read wrong.
 */
export const FOLDER_ICON: Record<MailTab, typeof Icon.Corporation> = {
  inbox: Icon.MailInbox,
  sent: Icon.MailSent,
  corp: Icon.Corporation,
  alliance: Icon.MailAlliance,
};

export function mailAgeLabel(bucket: MailAgeBucket, t: TFunction): string {
  return bucket.kind === 'month'
    ? formatMonthLabel(new Date(bucket.year, bucket.month - 1, 1))
    : t(`mail.age.${bucket.kind}`);
}

/** A list row: one mail, tagged with whose mailbox it sits in. `mail_id` repeats across mailboxes, `key` does not. */
export interface MailRow {
  key: string;
  ownerId: number;
  ownerName: string;
  header: MailHeader;
  tab: MailTab;
}
