import { parseLocalizedNumber } from '../numbers/parseLocalizedNumber';
import type { SurveyRock } from './series';

const METRES_PER: Record<string, number> = { m: 1, km: 1000, au: 149_597_870_700 };

const NUMBER = "[\\d.,'\\u2019]+";
const ROW = new RegExp(
  `^(.+?)\\s+(${NUMBER})\\s+(${NUMBER})\\s*m(?:3|³)\\s+(?:(${NUMBER})\\s*ISK\\s+)?(${NUMBER})\\s*(km|m|AU)$`,
  'i'
);

const GRADE = /\s(?:I|II|III|IV|V)-Grade$/;

const firstWord = (name: string): string => name.split(' ')[0];

export function parseSurveyScan(text: string): SurveyRock[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return null;

  const rowOres = new Set<string>();
  for (const line of lines) {
    const match = ROW.exec(line);
    if (match) rowOres.add(firstWord(match[1]));
  }

  const rocks: SurveyRock[] = [];
  for (const [i, line] of lines.entries()) {
    const match = ROW.exec(line);
    if (!match) {
      const next = lines[i + 1];
      const bare = !/\d/.test(line);
      const nextRowIsSameOre = next !== undefined && ROW.test(next) && next.startsWith(line);
      const emptyGroup =
        (next === undefined || !/\d/.test(next)) &&
        (GRADE.test(line) || rowOres.has(firstWord(line)));
      if (bare && (nextRowIsSameOre || emptyGroup)) continue;
      return null;
    }
    const units = parseLocalizedNumber(match[2]);
    const volume = parseLocalizedNumber(match[3]);
    const isk = match[4] === undefined ? undefined : parseLocalizedNumber(match[4]);
    const distance = parseLocalizedNumber(match[5]);
    if (units === null || volume === null || isk === null || distance === null) return null;
    rocks.push({
      ore: match[1],
      units,
      volume,
      ...(isk === undefined ? {} : { isk }),
      distanceM: distance * METRES_PER[match[6].toLowerCase()],
    });
  }
  if (rocks.length === 0) return null;
  return rocks;
}

export function isSurveyScanText(text: string): boolean {
  return parseSurveyScan(text) !== null;
}
