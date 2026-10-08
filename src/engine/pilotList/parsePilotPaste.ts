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

/** One D-Scan row: the type id plus the two columns a fleet view reads. */
export interface DscanRow {
  typeId: number;
  /** The ship's own name (column 2), not the pilot's. Empty for drones and most structures. */
  name: string;
  /** The type's name as the client printed it (column 3). */
  typeName: string;
  /** Distance from the scanner in km, or null when the row has none. */
  distanceKm: number | null;
}

const KM_PER_AU = 149_597_870.7;

/** `1,234 km`, `3,500 m` or `2 AU` as km; `-`, blank or anything else as null. */
export function parseDscanDistance(text: string | undefined): number | null {
  const match = /^([\d,]+(?:\.\d+)?)\s*(km|m|AU)$/i.exec((text ?? '').trim());
  if (match === null) return null;
  const value = Number(match[1].replaceAll(',', ''));
  if (!Number.isFinite(value)) return null;
  const unit = match[2].toLowerCase();
  return unit === 'au' ? value * KM_PER_AU : unit === 'm' ? value / 1000 : value;
}

function parseDscanRow(line: string): DscanRow {
  const [id, name = '', typeName = '', distance] = line.split('\t');
  return {
    typeId: Number(id),
    name: name.trim(),
    typeName: typeName.trim(),
    distanceKm: parseDscanDistance(distance),
  };
}

export type PilotPaste =
  | { kind: 'local'; names: string[]; overflow: number }
  | {
      kind: 'dscan';
      typeIds: number[];
      rows: DscanRow[];
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
    const rows = lines.map(parseDscanRow);
    return {
      kind: 'dscan',
      typeIds: rows.map((row) => row.typeId),
      rows,
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
