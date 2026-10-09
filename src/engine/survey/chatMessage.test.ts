import { describe, expect, it } from 'vitest';
import { textWidth } from './chatFont';
import {
  MAX_ROW_PX,
  surveyChatMessage,
  shortOreNames,
  type SurveyMessageLabels,
} from './chatMessage';
import { summarizeSurvey, type SurveyScan } from './series';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 8, 16, 40, 0);
const URL = 'https://neocomdesk.test/survey/abc123XYZ';

const labels: SurveyMessageLabels = {
  heading: 'Neocom Desk Report',
  done: 'ETA: {time} EVE (~{left})',
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

  it('shortens graded ore names to the ore and its grade numeral', () => {
    expect(shortOreNames(['Pyroxeres', 'Pyroxeres II-Grade'])).toEqual({
      Pyroxeres: 'Pyroxeres',
      'Pyroxeres II-Grade': 'Pyroxeres II',
    });
  });
});

/** The message split into its heading and the rows of the box. */
function parts(message: string): { heading: string; box: string[] } {
  const [heading, ...box] = message.split('\n');
  return { heading, box };
}

const message = (scans: SurveyScan[], url = URL): { heading: string; box: string[] } =>
  parts(surveyChatMessage(summarizeSurvey(scans)!, url, labels));

/** The ore row pads in 7px spaces, so its edge can sit up to half a space off the rails'. */
const MAX_SPREAD_PX = 4;

/** Pixels between the widest and narrowest row of the box. */
const spread = (box: string[]): number => {
  const widths = box.map(textWidth);
  return Math.max(...widths) - Math.min(...widths);
};

describe('surveyChatMessage', () => {
  it('opens with a heading line, then a closed box of ETA, bar, ore line and link', () => {
    // 930 m3 mined in 900 s, 70 left at 1.0333 m3/s: about 68 s to go
    const { heading, box } = message([
      scan(0, ['Glistening Sylvite', 800], ['Glistening Bitumens', 200]),
      scan(15, ['Glistening Sylvite', 40], ['Glistening Sylvite', 20], ['Glistening Bitumens', 10]),
    ]);
    expect(heading).toBe('Neocom Desk Report');
    expect(box).toHaveLength(4);
    expect(box[0]).toMatch(/^╔═*\[ +ETA: 16:56 EVE \(~1m\) +\]═*╗$/);
    expect(box[1]).toMatch(/^║ █+░+ +93% ║$/);
    expect(box[2]).toMatch(/^║ Left: 2 Sylvite · 1 Bitumens +║$/);
    expect(box[3]).toMatch(/^╚═*\[ +https:\/\/neocomdesk\.test\/survey\/abc123XYZ +\]═*╝$/);
  });

  it('pads every row of the box to the same pixel width, within four pixels', () => {
    expect(spread(message([scan(0, ['A', 1000]), scan(5, ['A', 750])]).box)).toBeLessThanOrEqual(
      MAX_SPREAD_PX
    );
  });

  it('keeps every row of a long-named field within four pixels of one another', () => {
    const { box } = message([
      scan(0, ['Brimful Zeolites', 90_000], ['Brimful Bitumens', 80_000], ['Sylvite', 70_000]),
      scan(10, ['Brimful Zeolites', 80_000], ['Brimful Bitumens', 80_000], ['Sylvite', 60_000]),
    ]);
    expect(spread(box)).toBeLessThanOrEqual(MAX_SPREAD_PX);
  });

  it('centres the ETA and the link in their rails', () => {
    const { box } = message([scan(0, ['A', 1000]), scan(5, ['A', 750])]);
    for (const [row, label] of [
      [box[0], 'ETA:'],
      [box[3], 'https:'],
    ] as const) {
      const before = textWidth(row.slice(0, row.indexOf(label)));
      const after = textWidth(row.slice(row.lastIndexOf(']')));
      expect(Math.abs(before - after)).toBeLessThanOrEqual(2 * textWidth('═'));
    }
  });

  it('widens the whole box when the link is longer than the ore line', () => {
    const scans = [scan(0, ['A', 1000]), scan(5, ['A', 750])];
    const short = message(scans, 'https://x.test/s/a').box;
    const long = message(scans, 'https://neocomdesk.test/survey/' + 'a'.repeat(60)).box;
    expect(textWidth(long[0])).toBeGreaterThan(textWidth(short[0]) + 100);
    expect(spread(long)).toBeLessThanOrEqual(MAX_SPREAD_PX);
  });

  it('shows hours and minutes when long', () => {
    // 1 m3/s with 9400 s left is 2h 36m 40s
    const { box } = message([scan(0, ['A', 10_000]), scan(10, ['A', 9_400])]);
    expect(box[0]).toContain('(~2h 37m)');
  });

  it('with one scan says it is waiting for a second', () => {
    const { box } = message([scan(0, ['A', 10_000])]);
    expect(box[0]).toContain('waiting for a second scan');
    expect(box[1]).toMatch(/ 0% ║$/);
  });

  it('fills the bar by progress', () => {
    const { box } = message([scan(0, ['A', 1000]), scan(5, ['A', 750])]);
    const filled = box[1].match(/█/g)?.length ?? 0;
    const empty = box[1].match(/░/g)?.length ?? 0;
    expect(box[1]).toMatch(/ 25% ║$/);
    expect(filled / (filled + empty)).toBeCloseTo(0.25, 1);
  });

  it('names the two biggest ores and counts the rocks of the rest as one group', () => {
    const { box } = message([scan(0, ['A', 5], ['B', 4], ['C', 3], ['D', 2], ['E', 1], ['E', 1])]);
    expect(box[2]).toMatch(/^║ Left: 1 A · 1 B · 4 other +║$/);
  });

  it('calls out the two ores richest per m³, with how many rocks each has', () => {
    // Per m³: Scordite 50k, Kernite 20k, Pyroxeres 8k, Veldspar 5k (total ISK would put Pyroxeres second).
    const rocks = (ore: string, count: number, each: number) =>
      Array.from({ length: count }, () => ({ ore, volume: 100, isk: each }));
    const { box } = message([
      {
        at: T0,
        rocks: [
          ...rocks('Veldspar', 20, 500_000),
          ...rocks('Scordite', 5, 5_000_000),
          ...rocks('Pyroxeres', 15, 800_000),
          ...rocks('Kernite', 4, 2_000_000),
        ],
      },
    ]);
    expect(box[2]).toMatch(/^║ Left: 5 Scordite · 4 Kernite · 35 other +║$/);
  });

  it('a cleared field is a heading and three rows, the full bar and the time in the top rail', () => {
    const { heading, box } = message([scan(0, ['A', 1000]), scan(176)]);
    expect(heading).toBe('Neocom Desk Report');
    expect(box).toHaveLength(3);
    expect(box[0]).toMatch(/^╔═*\[ +Field cleared in 2h 56m +\]═*╗$/);
    expect(box[1]).toMatch(/^║ █+ +100% ║$/);
    expect(box[1]).not.toContain('░');
    expect(box[2]).toContain(URL);
    expect(spread(box)).toBeLessThanOrEqual(MAX_SPREAD_PX);
  });
});

describe('chat message width', () => {
  it('fits the ore line to the row width, listing the rest as a count', () => {
    const { box } = message([
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
    ]);
    expect(box).toHaveLength(4);
    expect(textWidth(box[2])).toBeLessThanOrEqual(MAX_ROW_PX);
    expect(box[2]).toMatch(/^║ Left: .* · \d+ other +║$/);
  });

  it('never drops the biggest ore, even when its name alone is long', () => {
    const { box } = message([scan(0, ['An Extremely Long Ore Name Indeed Mercoxit II-Grade', 5])]);
    expect(box[2]).toContain('Extremely');
  });
});
