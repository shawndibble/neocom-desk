import { describe, expect, it } from 'vitest';
import {
  MAX_LINE_WIDTH,
  surveyChatMessage,
  shortOreNames,
  type SurveyMessageLabels,
} from './chatMessage';
import { summarizeSurvey, type SurveyScan } from './series';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 8, 16, 40, 0);
const URL = 'https://neocomdesk.test/survey/abc123XYZ';

const labels: SurveyMessageLabels = {
  done: 'ETA: <b>{time} EVE</b> (~{left})',
  waiting: 'waiting for a second scan',
  left: 'Left: {ores}',
  more: '{count} other',
  cleared: 'Field cleared in {duration}',
};

function scan(minutes: number, ...rocks: [string, number][]): SurveyScan {
  return { at: T0 + minutes * MIN, rocks: rocks.map(([ore, volume]) => ({ ore, volume })) };
}

describe('shortOreNames', () => {
  it('drops the quality prefix when the base name is unique', () => {
    expect(shortOreNames(['Glistening Sylvite', 'Glistening Bitumens'])).toEqual({
      'Glistening Sylvite': 'Sylvite',
      'Glistening Bitumens': 'Bitumens',
    });
  });

  it('keeps full names when two variants share a base', () => {
    const m = shortOreNames(['Dense Veldspar', 'Concentrated Veldspar', 'Scordite']);
    expect(m['Dense Veldspar']).toBe('Dense Veldspar');
    expect(m['Concentrated Veldspar']).toBe('Concentrated Veldspar');
    expect(m.Scordite).toBe('Scordite');
  });

  it('leaves names alone when the first word is not a quality prefix', () => {
    const names = ['Dark Ochre', 'Clear Icicle', 'Blue Ice', 'Glacial Mass'];
    expect(shortOreNames(names)).toEqual(Object.fromEntries(names.map((n) => [n, n])));
  });
});

describe('surveyChatMessage', () => {
  const visible = (line: string): number => line.replace(/<\/?b>/g, '').length;
  const split = (message: string): string[] => message.split('\n');

  it('writes ETA, bar with percent, ore line and link inside a closed box', () => {
    // 930 m3 mined in 900 s, 70 left at 1.0333 m3/s: about 68 s to go
    const s = summarizeSurvey([
      scan(0, ['Glistening Sylvite', 800], ['Glistening Bitumens', 200]),
      scan(15, ['Glistening Sylvite', 40], ['Glistening Sylvite', 20], ['Glistening Bitumens', 10]),
    ])!;
    const lines = split(surveyChatMessage(s, URL, labels));
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^╔═+\[ ETA: <b>16:56 EVE<\/b> \(~1m\) \]═+╗$/);
    expect(lines[1]).toMatch(/^║ █+░+ 93% ║$/);
    expect(lines[2]).toMatch(/^║ Left: 2 Sylvite · 1 Bitumens\s+ ║$/);
    // The link is the widest element here, so its rail has no `═` to spare.
    expect(lines[3]).toBe(`╚[ ${URL} ]╝`);
  });

  it('makes the top rail, bar row, ore row and bottom rail the same width', () => {
    const s = summarizeSurvey([scan(0, ['A', 1000]), scan(5, ['A', 750])])!;
    const lines = split(surveyChatMessage(s, URL, labels));
    expect(new Set(lines.map(visible)).size).toBe(1);
  });

  it('centres the ETA and the link in their rails', () => {
    const s = summarizeSurvey([scan(0, ['A', 1000]), scan(5, ['A', 750])])!;
    const lines = split(surveyChatMessage(s, URL, labels));
    for (const i of [0, 3]) {
      const [, before, after] = /^.(═*)\[.*\](═*).$/.exec(lines[i])!;
      expect(Math.abs(before.length - after.length)).toBeLessThanOrEqual(1);
    }
  });

  it('is as wide as the ore row when the link is shorter, and as wide as the link when it is longer', () => {
    const s = summarizeSurvey([
      scan(0, ['Veldspar', 90_000], ['Scordite', 70_000], ['Pyroxeres', 50_000]),
      scan(10, ['Veldspar', 80_000], ['Scordite', 60_000], ['Pyroxeres', 40_000]),
    ])!;
    const shortUrl = 'https://x.test/s/a';
    const longUrl = 'https://neocomdesk.test/survey/' + 'a'.repeat(60);
    const withShort = split(surveyChatMessage(s, shortUrl, labels));
    const withLong = split(surveyChatMessage(s, longUrl, labels));
    expect(visible(withShort[0])).toBe(visible(withShort[2]));
    expect(visible(withShort[0])).toBe(4 + withShort[2].slice(2, -2).trimEnd().length);
    expect(visible(withLong[0])).toBeGreaterThan(visible(withShort[0]));
    expect(visible(withLong[3])).toBe(visible(withLong[0]));
  });

  it('shows hours and minutes when long', () => {
    // 1 m3/s with 9400 s left is 2h 36m 40s
    const s = summarizeSurvey([scan(0, ['A', 10_000]), scan(10, ['A', 9_400])])!;
    expect(split(surveyChatMessage(s, URL, labels))[0]).toContain('(~2h 37m)');
  });

  it('with one scan says it is waiting for a second', () => {
    const s = summarizeSurvey([scan(0, ['A', 10_000])])!;
    const lines = split(surveyChatMessage(s, URL, labels));
    expect(lines[0]).toContain('[ waiting for a second scan ]');
    expect(lines[1]).toContain(' 0% ║');
  });

  it('fills the bar by progress', () => {
    const s = summarizeSurvey([scan(0, ['A', 1000]), scan(5, ['A', 750])])!;
    const bar = split(surveyChatMessage(s, URL, labels))[1];
    const filled = bar.match(/█/g)?.length ?? 0;
    const empty = bar.match(/░/g)?.length ?? 0;
    expect(bar).toContain(' 25% ║');
    expect(filled / (filled + empty)).toBeCloseTo(0.25, 1);
  });

  it('names the two biggest ores and counts the rocks of the rest as one group', () => {
    const s = summarizeSurvey([
      scan(0, ['A', 5], ['B', 4], ['C', 3], ['D', 2], ['E', 1], ['E', 1]),
    ])!;
    expect(split(surveyChatMessage(s, URL, labels))[2]).toMatch(
      /^║ Left: 1 A · 1 B · 4 other\s+ ║$/
    );
  });

  it('calls out the two ores richest per m³, with how many rocks each has', () => {
    // Per m³: Scordite 50k, Kernite 20k, Pyroxeres 8k, Veldspar 5k (total ISK would put Pyroxeres second).
    const rocks = (ore: string, count: number, each: number) =>
      Array.from({ length: count }, () => ({ ore, volume: 100, isk: each }));
    const s = summarizeSurvey([
      {
        at: T0,
        rocks: [
          ...rocks('Veldspar', 20, 500_000),
          ...rocks('Scordite', 5, 5_000_000),
          ...rocks('Pyroxeres', 15, 800_000),
          ...rocks('Kernite', 4, 2_000_000),
        ],
      },
    ])!;
    expect(split(surveyChatMessage(s, URL, labels))[2]).toMatch(
      /^║ Left: 5 Scordite · 4 Kernite · 35 other\s+ ║$/
    );
  });

  it('a cleared field is three lines with the full bar and elapsed time in the top rail', () => {
    const s = summarizeSurvey([scan(0, ['A', 1000]), scan(176)])!;
    const lines = split(surveyChatMessage(s, URL, labels));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^╔═+\[ Field cleared in 2h 56m \]═+╗$/);
    expect(lines[1]).toMatch(/^║ █+ 100% ║$/);
    expect(lines[1]).not.toContain('░');
    expect(lines[2]).toContain(URL);
    expect(new Set(lines.map(visible)).size).toBe(1);
  });
});

describe('chat message width', () => {
  const visible = (line: string): number => line.replace(/<\/?b>/g, '').length;

  it('shortens graded ore names to the ore and its grade numeral', () => {
    expect(shortOreNames(['Pyroxeres', 'Pyroxeres II-Grade'])).toEqual({
      Pyroxeres: 'Pyroxeres',
      'Pyroxeres II-Grade': 'Pyroxeres II',
    });
  });

  it('stays at four lines and fits the ore line to the width, listing the rest as a count', () => {
    const s = summarizeSurvey([
      scan(
        0,
        ['Veldspar', 90_000],
        ['Veldspar II-Grade', 80_000],
        ['Scordite', 70_000],
        ['Scordite II-Grade', 60_000],
        ['Pyroxeres', 50_000],
        ['Pyroxeres II-Grade', 40_000],
        ['Pyroxeres III-Grade', 30_000]
      ),
      scan(
        10,
        ['Veldspar', 80_000],
        ['Veldspar II-Grade', 80_000],
        ['Scordite', 60_000],
        ['Scordite II-Grade', 60_000],
        ['Pyroxeres', 40_000],
        ['Pyroxeres II-Grade', 40_000],
        ['Pyroxeres III-Grade', 30_000]
      ),
    ])!;
    const lines = surveyChatMessage(s, URL, labels).split('\n');
    expect(lines).toHaveLength(4);
    expect(visible(lines[2])).toBeLessThanOrEqual(MAX_LINE_WIDTH);
    expect(lines[2]).toMatch(/^║ Left: .* · \d+ other\s* ║$/);
  });

  it('never drops the biggest ore, even when its name alone is long', () => {
    const s = summarizeSurvey([
      scan(0, ['An Extremely Long Ore Name Indeed Mercoxit II-Grade', 5]),
    ])!;
    expect(surveyChatMessage(s, URL, labels).split('\n')[2]).toContain('Extremely');
  });
});
