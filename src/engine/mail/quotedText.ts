/**
 * Where a mail's quoted history starts: the dashed separator a Reply appends
 * (`quoteMailBody`, the same rule the EVE client writes) when a `From:` line
 * follows it, or the "On <when>, <who> wrote:" line and `>` lines another
 * client left. The reader folds from that line on. A `>` block followed by
 * new writing is an inline reply, which stays open.
 */

// Looser than QUOTE_SEPARATOR (mail.ts) on purpose: the EVE client's own rule is also accepted.
const SEPARATOR = /^-{8,}\s*$/;
const ATTRIBUTION = /^On .+ wrote:\s*$/;

/** Index of the first line of the trailing quote, or null when the mail has none. */
export function trailingQuoteStart(
  lines: readonly string[],
  markers: readonly string[] = ['>']
): number | null {
  const rule = lines.findIndex(
    (line, i) =>
      SEPARATOR.test(line) && lines.slice(i + 1, i + 4).some((next) => /^From:\s/.test(next))
  );
  const marked = markedQuoteStart(lines, markers);
  if (rule === -1) return marked;
  return marked === null ? rule : Math.min(rule, marked);
}

function markedQuoteStart(lines: readonly string[], markers: readonly string[]): number | null {
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
    } else if (ATTRIBUTION.test(line) && sawQuote) {
      start = i;
    } else {
      break;
    }
  }
  return sawQuote ? start : null;
}
