import { parseLocalizedNumber } from '@/engine/numbers/parseLocalizedNumber';

export const MAX_LIST_PILOTS = 40;

export const MAX_LOCAL_NAMES = 2000;

const MAX_NAME_LENGTH = 37;
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} '.-]*$/u;
const DSCAN_LINE = /^(\d+)\t/;

export interface DscanRow {
  typeId: number;
  name: string;
  typeName: string;
  distanceKm: number | null;
}

const KM_PER_AU = 149_597_870.7;

export function parseDscanDistance(text: string | undefined): number | null {
  const match = /^(\d[\d.,'\s\u00a0\u2009\u202f]*?)\s*(km|m|AU)$/i.exec((text ?? '').trim());
  if (match === null) return null;
  const value = parseLocalizedNumber(match[1]);
  if (value === null) return null;
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
  if (names.length < 2) return null;
  return {
    kind: 'local',
    names: names.slice(0, MAX_LOCAL_NAMES),
    overflow: Math.max(0, names.length - MAX_LOCAL_NAMES),
  };
}
