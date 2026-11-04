/**
 * Where a mail's quoted history starts: the "On <when>, <who> wrote:" line and
 * the `>` lines under it that a Reply appends (`quoteMailBody`), or any trailing
 * run of `>` lines another client left. The reader and the Reply editor fold
 * from that line on. Only a quote that runs to the end counts: a `>` block
 * followed by new writing is an inline reply, which stays open.
 */

const ATTRIBUTION = /^On .+ wrote:\s*$/;

/** Index of the first line of the trailing quote, or null when the mail has none. */
export function trailingQuoteStart(
  lines: readonly string[],
  markers: readonly string[] = ['>']
): number | null {
  const isQuoted = (line: string) => markers.some((marker) => line.trimStart().startsWith(marker));
  let start: number | null = null;
  let sawQuote = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (isQuoted(line)) {
      sawQuote = true;
      start = i;
    } else if (line.trim() === '') {
      if (start === null) continue;
      // A blank line inside the tail belongs to it only if quote lines sit above it too.
      if (i === 0) break;
    } else if (ATTRIBUTION.test(line) && sawQuote) {
      start = i;
    } else {
      break;
    }
  }
  return sawQuote ? start : null;
}
