const SEPARATOR = /^-{8,}\s*$/;
const ATTRIBUTION = /^On .+ wrote:\s*$/;

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
