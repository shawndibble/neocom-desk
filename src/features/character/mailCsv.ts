import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { MailHeader } from '@/esi/endpoints';

/**
 * CSV columns for mail headers: date, sender, subject, read status. `date`
 * passes through as the raw ISO string, blank when ESI omitted it. Bodies
 * aren't part of the header list and stay out of this export.
 */
export function mailCsvColumns(
  t: CsvTranslate,
  nameFor: (senderId: number) => string
): CsvColumn<MailHeader>[] {
  return [
    { header: t('mail.csvDate'), value: (header) => header.timestamp ?? null },
    {
      header: t('mail.csvSender'),
      value: (header) =>
        header.from === undefined ? t('mail.unknownSender') : nameFor(header.from),
    },
    { header: t('mail.csvSubject'), value: (header) => header.subject || t('mail.noSubject') },
    {
      header: t('mail.csvRead'),
      value: (header) => t(header.is_read ? 'mail.csvReadYes' : 'mail.csvReadNo'),
    },
  ];
}
