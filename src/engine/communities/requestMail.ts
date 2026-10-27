/**
 * Text for the in-game mail a Member opens to a requester (issue #3811). The
 * game's subject field is short and takes no markup from us; names come from
 * other Members, so they are cleaned before they go in. Pure: the wording is
 * translated by the caller and passed in.
 */

import { mailSafe } from '@/lib/mailSafe';

/** The game's subject field holds this many characters. */
export const MAX_MAIL_SUBJECT = 100;

/** At most `max` characters, counted as code points so a surrogate pair is never cut in half. */
export function clipToCodePoints(text: string, max: number): string {
  const points = Array.from(text);
  return points.length <= max ? text : points.slice(0, max).join('');
}

/** "Reactive Metals + 2 more": the first line's name, and how many more follow. */
export function itemsSummary(names: readonly string[], more: (count: number) => string): string {
  if (names.length === 0) return '';
  return names.length > 1 ? `${names[0]} ${more(names.length - 1)}` : names[0];
}

/** The subject, cleaned and clipped to the field. */
export const mailSubject = (subject: string) =>
  clipToCodePoints(mailSafe(subject), MAX_MAIL_SUBJECT);
