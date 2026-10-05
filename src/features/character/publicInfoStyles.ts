/**
 * Class strings and small formatters shared by the Show Info Corporation and
 * Alliance tabs, so the two tabs read as one design. Components that share
 * them live in `PublicInfoParts.tsx`.
 */

/** Status words: type and colour, never a box — a box would read as a button (DESIGN.md §6). */
export const statusWordClassName = 'text-[0.6875rem] font-semibold tracking-widest uppercase';
/** One line from `md` up however many facts there are (tax, a pilot count and the killboard are optional). */
export const FACT_COLUMNS: Record<number, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
};
export const sectionHeading = 'text-xs font-semibold tracking-widest text-text-dim uppercase';
export const termClassName =
  'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

/** Only an absolute http(s) URL becomes a link; anything else a corp typed is left out. */
export function websiteUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** ESI's dates are midnight UTC; read in local time, a corp founded on the 12th reads the 11th. */
export function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** A founding date as "Jan 20, 2015", in UTC for the same reason. */
export function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
