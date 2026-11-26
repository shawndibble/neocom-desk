import { mailSafe } from '@/lib/mailSafe';

export const MAX_MAIL_SUBJECT = 100;

export function clipToCodePoints(text: string, max: number): string {
  const points = Array.from(text);
  return points.length <= max ? text : points.slice(0, max).join('');
}

export function itemsSummary(names: readonly string[], more: (count: number) => string): string {
  if (names.length === 0) return '';
  return names.length > 1 ? `${names[0]} ${more(names.length - 1)}` : names[0];
}

export const mailSubject = (subject: string) =>
  clipToCodePoints(mailSafe(subject), MAX_MAIL_SUBJECT);
