/**
 * Reads the text the in-game Survey Scanner results copy to the clipboard:
 * one row per rock, `ore  units  volume m3  value ISK  distance`, separated
 * by tabs (or runs of spaces after a round trip through a chat or a browser).
 *
 * Numbers are read with a comma as the thousands separator, the way an
 * English client prints them.
 */
import type { SurveyRock } from './series';

const METRES_PER: Record<string, number> = { m: 1, km: 1000, au: 149_597_870_700 };

const NUMBER = '[\\d.,]+';
const ROW = new RegExp(
  `^(.+?)\\s+(${NUMBER})\\s+(${NUMBER})\\s*m(?:3|³)\\s+(?:(${NUMBER})\\s*ISK\\s+)?(${NUMBER})\\s*(km|m|AU)$`,
  'i'
);

const num = (text: string): number => Number(text.replace(/,/g, ''));

/** "Scordite II-Grade" and "Scordite III-Grade" are grades of one ore. */
const GRADE = /\s(?:I|II|III|IV|V)-Grade$/;

const firstWord = (name: string): string => name.split(' ')[0];

/** Every non-blank line as a rock, or null if any line is not a scan row. */
export function parseSurveyScan(text: string): SurveyRock[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return null;

  // The first word of every ore that has a row ("Pyroxeres", "Veldspar"), so a
  // header for a grade with no rocks can be told from a stray line.
  const rowOres = new Set<string>();
  for (const line of lines) {
    const match = ROW.exec(line);
    if (match) rowOres.add(firstWord(match[1]));
  }

  const rocks: SurveyRock[] = [];
  for (const [i, line] of lines.entries()) {
    const match = ROW.exec(line);
    if (!match) {
      // The scanner prints each ore group's name on a line of its own above
      // its rows, and prints it for a group with no rocks too. A bare line is
      // a header when a row of the same ore follows, or (an empty group) when
      // it names a grade or an ore the scan has rows for and another bare line
      // or the end of the paste follows. Anything else is a stray line.
      const next = lines[i + 1];
      const bare = !/\d/.test(line);
      const nextRowIsSameOre = next !== undefined && ROW.test(next) && next.startsWith(line);
      const emptyGroup =
        (next === undefined || !/\d/.test(next)) &&
        (GRADE.test(line) || rowOres.has(firstWord(line)));
      if (bare && (nextRowIsSameOre || emptyGroup)) continue;
      return null;
    }
    rocks.push({
      ore: match[1],
      units: num(match[2]),
      volume: num(match[3]),
      ...(match[4] === undefined ? {} : { isk: num(match[4]) }),
      distanceM: num(match[5]) * METRES_PER[match[6].toLowerCase()],
    });
  }
  if (rocks.length === 0) return null;
  return rocks;
}

/** True when the text is a survey scan; the paste router's signature check. */
export function isSurveyScanText(text: string): boolean {
  return parseSurveyScan(text) !== null;
}
