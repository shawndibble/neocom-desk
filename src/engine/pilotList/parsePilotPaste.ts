/**
 * Reads a pasted Local list or D-Scan (issue #2863). Two or more lines make a
 * list; a single name stays today's one-pilot lookup.
 *
 * Deliberately strict, since the app-wide paste router offers the result on
 * pastes the pilot never aimed at a field: every line must look like a pilot
 * name (or every line like a D-Scan row), so prose and URLs stay a no-op.
 */

/** Names looked up per paste; the rest are counted, never silently dropped. */
export const MAX_LIST_PILOTS = 40;

/** EVE character names are at most 37 characters. */
const MAX_NAME_LENGTH = 37;
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} '.-]*$/u;
const DSCAN_LINE = /^(\d+)\t/;

export type PilotPaste =
  | { kind: 'local'; names: string[]; overflow: number }
  | {
      kind: 'dscan';
      typeIds: number[];
      /** The scan, trimmed and one row per line: what a Share Link stores. */
      text: string;
    };

export function classifyPilotPaste(text: string): PilotPaste | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length < 2) return null;

  if (lines.every((line) => DSCAN_LINE.test(line))) {
    return {
      kind: 'dscan',
      typeIds: lines.map((line) => Number(DSCAN_LINE.exec(line)?.[1])),
      text: lines.join('\n'),
    };
  }

  if (!lines.every((line) => line.length <= MAX_NAME_LENGTH && NAME_PATTERN.test(line))) {
    return null;
  }
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(line);
  }
  // A list that collapses to one name is a single lookup.
  if (names.length < 2) return null;
  return {
    kind: 'local',
    names: names.slice(0, MAX_LIST_PILOTS),
    overflow: Math.max(0, names.length - MAX_LIST_PILOTS),
  };
}
