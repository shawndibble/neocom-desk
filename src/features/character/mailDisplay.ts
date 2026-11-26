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

export interface MailRow {
  key: string;
  ownerId: number;
  ownerName: string;
  header: MailHeader;
  tab: MailTab;
  labelNames: readonly string[];
}

export function isMailRead(
  row: Pick<MailRow, 'key' | 'header'>,
  locallyReadKeys: ReadonlySet<string>,
  locallyUnreadKeys: ReadonlySet<string>
): boolean {
  if (locallyUnreadKeys.has(row.key)) return false;
  return Boolean(row.header.is_read) || locallyReadKeys.has(row.key);
}
