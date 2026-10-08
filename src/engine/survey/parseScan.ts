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
  `^(.+?)\\s+(${NUMBER})\\s+(${NUMBER})\\s*m(?:3|³)\\s+(?:${NUMBER}\\s*ISK\\s+)?(${NUMBER})\\s*(km|m|AU)$`,
  'i'
);

const num = (text: string): number => Number(text.replace(/,/g, ''));

/** Every non-blank line as a rock, or null if any line is not a scan row. */
export function parseSurveyScan(text: string): SurveyRock[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return null;

  const rocks: SurveyRock[] = [];
  for (const [i, line] of lines.entries()) {
    const match = ROW.exec(line);
    if (!match) {
      // The scanner prints each ore's name on a line of its own above its rows.
      if (!/\d/.test(line) && lines[i + 1]?.startsWith(line) && ROW.test(lines[i + 1])) continue;
      return null;
    }
    rocks.push({
      ore: match[1],
      units: num(match[2]),
      volume: num(match[3]),
      distanceM: num(match[4]) * METRES_PER[match[5].toLowerCase()],
    });
  }
  if (rocks.length === 0) return null;
  return rocks;
}

/** True when the text is a survey scan; the paste router's signature check. */
export function isSurveyScanText(text: string): boolean {
  return parseSurveyScan(text) !== null;
}
