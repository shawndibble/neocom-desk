import { describe, expect, it } from 'vitest';
import { textWidth } from './chatFont';
import {
  DEFAULT_SURVEY_CHAT_OPTIONS,
  MAX_ROW_PX,
  parseSurveyChatOptions,
  type SurveyChatOptions,
  surveyChatMessage,
  type SurveyMessageLabels,
} from './chatMessage';
import { summarizeSurvey, type SurveyScan } from './series';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 8, 16, 40, 0);
const URL = 'https://neocomdesk.test/survey/abc123XYZ';
const CHARACTER_PX = textWidth('─');

const labels: SurveyMessageLabels = {
  heading: 'Neocom Desk Report',
  done: 'ETA: {time} EVE (~{left})',
  waiting: 'waiting for a second scan',
  left: 'Left: {ores}',
  more: '{count} other',
  cleared: 'Field cleared in {duration}',
  location: '{place}',
  percent: '{percent}%',
  pace: 'Pace: {pace} m³/s',
  value: '{isk} ISK',
  volume: '{left} m³',
  elapsed: 'Duration: {duration}',
};

function scan(minutes: number, ...rocks: [string, number][]): SurveyScan {
  return { at: T0 + minutes * MIN, rocks: rocks.map(([ore, volume]) => ({ ore, volume })) };
}

/** The message split into its heading and the rows of the box. */
function parts(message: string): { heading: string; box: string[] } {
  const [heading, ...box] = message.split('\n');
  return { heading, box };
}

const message = (
  scans: SurveyScan[],
  url = URL,
  unitPrices?: ReadonlyMap<string, number>
): { heading: string; box: string[] } =>
  parts(surveyChatMessage(summarizeSurvey(scans, unitPrices)!, url, labels));

/**
 * The rails sit over the bar without ever being shorter than it, and less than
 * two characters longer (the bar rounds down, the rails up); and the two rails
 * end within a character of each other.
 */
function expectRailsOverBar(box: string[]): void {
  const [top, bar, bottom] = [box[0], box[1], box[box.length - 1]].map(textWidth);
  for (const rail of [top, bottom]) {
    expect(rail).toBeGreaterThanOrEqual(bar);
    expect(rail).toBeLessThan(bar + 2 * CHARACTER_PX);
  }
  expect(Math.abs(top - bottom)).toBeLessThan(CHARACTER_PX);
}

describe('surveyChatMessage', () => {
  it('counts the time left from the given clock, not from the last scan', () => {
    // Last scan at +10 m, finish estimated at +20 m (1000 m3 left at 1.667 m3/s).
    const summary = summarizeSurvey([scan(0, ['Veldspar', 2000]), scan(10, ['Veldspar', 1000])])!;
    const text = (now?: number) => surveyChatMessage(summary, URL, labels, now);
    expect(text()).toContain('(~10m)');
    expect(text(T0 + 15 * MIN)).toContain('(~5m)');
  });

  it('opens with a heading line, then an ETA rail, the bar, the ore line and a link rail', () => {
    // 930 m3 mined in 900 s, 70 left at 1.0333 m3/s: about 68 s to go
    const { heading, box } = message([
      scan(0, ['Glistening Sylvite', 800], ['Glistening Bitumens', 200]),
      scan(15, ['Glistening Sylvite', 40], ['Glistening Sylvite', 20], ['Glistening Bitumens', 10]),
    ]);
    expect(heading).toBe('Neocom Desk Report');
    expect(box).toHaveLength(4);
    expect(box[0]).toMatch(/^┌─*\[ ETA: 16:56 EVE \(~1m\) \]─*╌┄┈$/);
    expect(box[1]).toMatch(/^│ █+░+$/);
    expect(box[2]).toBe('│ Left: 2 Glistening Sylvite · 1 other');
    expect(box[3]).toMatch(/^└─*\[ https:\/\/neocomdesk\.test\/survey\/abc123XYZ \]─*╌┄┈$/);
  });

  it('never makes a rail shorter than the content, and at most a character longer', () => {
    const cases = [
      // the ore line sets the width
      [
        scan(0, ['Brimful Zeolites', 90_000], ['Brimful Bitumens', 80_000], ['Sylvite', 70_000]),
        scan(10, ['Brimful Zeolites', 80_000], ['Brimful Bitumens', 80_000], ['Sylvite', 60_000]),
      ],
      // the link sets the width
      [scan(0, ['A', 1000]), scan(5, ['A', 750])],
    ];
    for (const scans of cases) {
      const { box } = message(scans);
      const content = Math.max(textWidth(box[1]), textWidth(box[2]));
      for (const rail of [box[0], box[3]]) {
        expect(textWidth(rail)).toBeGreaterThanOrEqual(content);
        expect(textWidth(rail)).toBeLessThan(content + 2 * CHARACTER_PX);
      }
    }
  });

  it('sets the rails over the bar, never shorter and at most two characters longer', () => {
    expectRailsOverBar(message([scan(0, ['A', 1000]), scan(5, ['A', 750])]).box);
  });

  it('centres the ETA and the link in their rails', () => {
    const { box } = message([scan(0, ['A', 1000]), scan(5, ['A', 750])]);
    for (const [row, label] of [
      [box[0], 'ETA:'],
      [box[3], 'https:'],
    ] as const) {
      const before = textWidth(row.slice(0, row.indexOf(label)));
      // everything between the label's closing bracket and the taper
      const after = textWidth(row.slice(row.lastIndexOf(']'), -3));
      expect(Math.abs(before - after)).toBeLessThanOrEqual(2 * CHARACTER_PX);
    }
  });

  it('lengthens the rails and bar when the link is longer than the ore line', () => {
    const scans = [scan(0, ['A', 1000]), scan(5, ['A', 750])];
    const short = message(scans, 'https://x.test/s/a').box;
    const long = message(scans, 'https://neocomdesk.test/survey/' + 'a'.repeat(60)).box;
    expect(textWidth(long[0])).toBeGreaterThan(textWidth(short[0]) + 100);
    expectRailsOverBar(long);
  });

  it('shows hours and minutes when long', () => {
    // 1 m3/s with 9400 s left is 2h 36m 40s
    const { box } = message([scan(0, ['A', 10_000]), scan(10, ['A', 9_400])]);
    expect(box[0]).toContain('(~2h 37m)');
  });

  it('with one scan says it is waiting for a second and has no bar row', () => {
    const { box } = message([scan(0, ['A', 10_000])]);
    expect(box).toHaveLength(3);
    expect(box[0]).toContain('waiting for a second scan');
    expect(box[1]).toBe('│ Left: 1 A');
    expect(box.join('\n')).not.toMatch(/[█░]/);
  });

  it('fills the bar by progress', () => {
    const { box } = message([scan(0, ['A', 1000]), scan(5, ['A', 750])]);
    const filled = box[1].match(/█/g)?.length ?? 0;
    const empty = box[1].match(/░/g)?.length ?? 0;
    expect(filled / (filled + empty)).toBeCloseTo(0.25, 1);
    // The bar is a visual aid only; the percent is the "Left:" line's to give.
    expect(box[1]).not.toMatch(/[\d%]/);
  });

  it('keeps the full ore name, since Brimful Zeolites is not worth what Zeolites is', () => {
    const { box } = message([scan(0, ['Brimful Zeolites', 100], ['Zeolites', 50])]);
    expect(box[1]).toBe('│ Left: 1 Brimful Zeolites · 1 Zeolites');
  });

  it('names the two biggest ores and counts the rocks of the rest as one group', () => {
    const { box } = message([scan(0, ['A', 5], ['B', 4], ['C', 3], ['D', 2], ['E', 1], ['E', 1])]);
    expect(box[1]).toBe('│ Left: 1 A · 1 B · 4 other');
  });

  it('calls out the two ores with the dearest unit price, with how many rocks each has', () => {
    // Per unit: Scordite 500, Kernite 200, Pyroxeres 80, Veldspar 50 (total ISK would put Pyroxeres second).
    const rocks = (ore: string, count: number) =>
      Array.from({ length: count }, () => ({ ore, volume: 100 }));
    const { box } = message(
      [
        {
          at: T0,
          rocks: [
            ...rocks('Veldspar', 20),
            ...rocks('Scordite', 5),
            ...rocks('Pyroxeres', 15),
            ...rocks('Kernite', 4),
          ],
        },
      ],
      URL,
      new Map([
        ['Scordite', 500],
        ['Kernite', 200],
        ['Pyroxeres', 80],
        ['Veldspar', 50],
      ])
    );
    expect(box[1]).toBe('│ Left: 5 Scordite · 4 Kernite · 35 other');
  });

  it('a cleared field is a heading and three rows, the full bar and the time in the top rail', () => {
    const { heading, box } = message([scan(0, ['A', 1000]), scan(176)]);
    expect(heading).toBe('Neocom Desk Report');
    expect(box).toHaveLength(3);
    expect(box[0]).toMatch(/^┌─*\[ Field cleared in 2h 56m \]─*╌┄┈$/);
    expect(box[1]).toMatch(/^│ █+$/);
    expect(box[1]).not.toContain('░');
    expect(box[2]).toContain(URL);
    expectRailsOverBar(box);
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
    expect(box[2]).toMatch(/^│ Left: .* · \d+ other$/);
  });

  it('names only one ore when a long first name leaves no room for a second', () => {
    // Plain Zeolites and Bitumens are on the field too, so "Brimful" stays in the names.
    const ores = (k: number): [string, number][] => [
      ['Brimful Zeolites', 90_000 * k],
      ['Brimful Bitumens', 80_000 * k],
      ['Zeolites', 20_000 * k],
      ['Bitumens', 10_000 * k],
    ];
    const { box } = message([scan(0, ...ores(1)), scan(10, ...ores(0.9))]);
    expect(box[2]).toMatch(/^│ Left: \d+ Brimful Zeolites · \d+ other$/);
    expect(textWidth(box[2])).toBeLessThanOrEqual(MAX_ROW_PX);
  });

  it('names two ores when both fit', () => {
    const { box } = message([
      scan(0, ['Scordite', 90_000], ['Veldspar', 80_000], ['Kernite', 70_000]),
    ]);
    expect(box[1]).toMatch(/^│ Left: \d+ Scordite · \d+ Veldspar · \d+ other$/);
  });

  it('never drops the biggest ore, even when its name alone is long', () => {
    const { box } = message([scan(0, ['An Extremely Long Ore Name Indeed Mercoxit II-Grade', 5])]);
    expect(box[1]).toContain('Extremely');
  });
});

describe('chat message options', () => {
  const two = [
    scan(0, ['Scordite', 9000], ['Kernite', 7000], ['Veldspar', 30000], ['Pyroxeres', 100]),
    scan(10, ['Scordite', 6000], ['Kernite', 5000], ['Veldspar', 22000], ['Pyroxeres', 80]),
  ];
  const withOptions = (changes: Partial<SurveyChatOptions>, location: string | null = null) =>
    parts(
      surveyChatMessage(
        summarizeSurvey(two)!,
        URL,
        labels,
        undefined,
        { ...DEFAULT_SURVEY_CHAT_OPTIONS, ...changes },
        location
      )
    );

  it('draws a double border with ║ and ═', () => {
    const { box } = withOptions({ border: 'double' });
    expect(box[0]).toMatch(/^╔═*\[ ETA: .* \]═*╌┄┈$/);
    expect(box[1]).toMatch(/^║ █+░+$/);
    expect(box[2]).toMatch(/^║ Left: /);
    expect(box[3]).toMatch(/^╚═*\[ https:.* \]═*╌┄┈$/);
  });

  it('with no border drops the rails, the taper and the brackets', () => {
    const { box } = withOptions({ border: 'none' });
    expect(box[0]).toMatch(/^ETA: .*\(~\d+m\)$/);
    expect(box[1]).toMatch(/^█+░+$/);
    expect(box[2]).toMatch(/^Left: /);
    expect(box[3]).toBe(URL);
    expect(box.join('')).not.toMatch(/[─═┌└╔╚╌┄┈[\]]/);
  });

  it('always keeps the heading and the link row', () => {
    const { heading, box } = withOptions({
      eta: false,
      bar: false,
      ores: 'off',
    });
    expect(heading).toBe('Neocom Desk Report');
    expect(box).toHaveLength(2);
    expect(box[0]).toMatch(/^┌─+╌┄┈$/);
    expect(box[1]).toContain(URL);
  });

  it('drops the bar and keeps the ETA when asked', () => {
    const { box } = withOptions({ bar: false });
    expect(box).toHaveLength(3);
    expect(box[0]).toContain('ETA:');
    expect(box.join('')).not.toContain('█');
  });

  it('names the top three ores, or every ore', () => {
    const short = summarizeSurvey([scan(0, ['A', 5], ['B', 4], ['C', 3], ['D', 2], ['E', 1])])!;
    const top3 = surveyChatMessage(short, URL, labels, undefined, {
      ...DEFAULT_SURVEY_CHAT_OPTIONS,
      ores: 'top3',
    });
    expect(top3).toContain('│ Left: 1 A · 1 B · 1 C · 2 other');
    const all = withOptions({ ores: 'all' }).box.join('\n');
    for (const ore of ['Scordite', 'Veldspar', 'Kernite', 'Pyroxeres']) expect(all).toContain(ore);
    expect(all).not.toContain('other');
  });

  it('wraps an all-ores list onto more rows rather than past the width', () => {
    const many: [string, number][] = [
      'Veldspar',
      'Scordite',
      'Pyroxeres',
      'Plagioclase',
      'Omber',
      'Kernite',
      'Jaspet',
      'Hemorphite',
    ].map((ore, i) => [ore, 1000 + i]);
    const summary = summarizeSurvey([
      scan(0, ...many),
      scan(5, ...many.map(([o, v]): [string, number] => [o, v - 100])),
    ])!;
    const { box } = parts(
      surveyChatMessage(summary, URL, labels, undefined, {
        ...DEFAULT_SURVEY_CHAT_OPTIONS,
        ores: 'all',
      })
    );
    const rows = box.slice(2, -1);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(textWidth(row)).toBeLessThanOrEqual(MAX_ROW_PX);
  });

  it('lists ore names without rock counts', () => {
    expect(withOptions({ rockCounts: false }).box[2]).toBe('│ Left: Veldspar · Scordite · 2 other');
  });

  it('adds the location, pace and duration rows only when chosen', () => {
    const off = withOptions({}, 'Efa IV').box.join('\n');
    for (const word of ['Efa', 'Pace', 'Duration', 'ISK', 'm³']) expect(off).not.toContain(word);
    const { box } = withOptions({ location: true, pace: true, elapsed: true }, 'Efa IV');
    // The place takes the top rail and the ETA moves into the body.
    expect(box[0]).toMatch(/^┌─*\[ Efa IV \]─*╌┄┈$/);
    expect(box[2]).toMatch(/^│ Left: /);
    expect(box[3]).toMatch(/^│ ETA: /);
    // Short facts share a row.
    expect(box[4]).toMatch(/^│ Pace: \d+ m³\/s · Duration: 10m$/);
  });

  it('keeps the place as the top line with no border or no ETA', () => {
    const bare = withOptions({ location: true, border: 'none' }, 'Efa IV').box;
    expect(bare[0]).toBe('Efa IV');
    expect(bare.join('\n')).toContain('ETA: ');
    const noEta = withOptions({ location: true, eta: false }, 'Efa IV').box.join('\n');
    expect(noEta).toContain('[ Efa IV ]');
    expect(noEta).not.toContain('ETA');
  });

  it('puts value and volume on the Left line, right under the bar, with just their units', () => {
    const { box } = withOptions({ ores: 'off', volumeLeft: true, iskLeft: false });
    expect(box[1]).toMatch(/^│ █+░+$/);
    expect(box[2]).toBe('│ Left: 33,080 m³');
  });

  it('continues the Left line with the ores first, then value, then volume', () => {
    const rocks = (a: number, b: number) => ({
      at: T0 + (a === 5 ? 0 : 5 * MIN),
      rocks: [
        { ore: 'A', volume: a, isk: a * 1_000_000 },
        { ore: 'B', volume: b, isk: b * 1_000_000 },
      ],
    });
    const summary = summarizeSurvey([rocks(5, 4), rocks(4, 3)])!;
    const text = surveyChatMessage(summary, URL, labels, undefined, {
      ...DEFAULT_SURVEY_CHAT_OPTIONS,
      iskLeft: true,
      volumeLeft: true,
    });
    expect(text).toMatch(/│ Left: 1 A · 1 B · 7M ISK · 7 m³/);
  });

  it('shows the percent left on the Left line with the bar off', () => {
    const { box } = withOptions({ bar: false, ores: 'off', percentLeft: true });
    expect(box).toHaveLength(3);
    expect(box[1]).toMatch(/^│ Left: \d+%$/);
    expect(box.join('')).not.toContain('█');
  });

  it('has no Left line when nothing that is left is chosen', () => {
    const { box } = withOptions({ ores: 'off' });
    expect(box.join('\n')).not.toContain('Left:');
    expect(box).toHaveLength(3);
  });
  it('skips the location row when the survey has none', () => {
    expect(withOptions({ location: true }, null).box).toHaveLength(4);
  });

  it('a cleared field keeps its headline and loses the bar when the bar is off', () => {
    const summary = summarizeSurvey([scan(0, ['A', 1000]), scan(176)])!;
    const { box } = parts(
      surveyChatMessage(summary, URL, labels, undefined, {
        ...DEFAULT_SURVEY_CHAT_OPTIONS,
        bar: false,
        eta: false,
      })
    );
    expect(box).toHaveLength(2);
    expect(box[0]).toContain('Field cleared in 2h 56m');
  });
});

describe('parseSurveyChatOptions', () => {
  it('fills what a saved value lacks from the defaults', () => {
    expect(parseSurveyChatOptions({ border: 'double', pace: true })).toEqual({
      ...DEFAULT_SURVEY_CHAT_OPTIONS,
      border: 'double',
      pace: true,
    });
  });

  it('ignores values of the wrong kind and rejects non-objects', () => {
    expect(parseSurveyChatOptions({ border: 'round', bar: 'yes', ores: 7 })).toEqual(
      DEFAULT_SURVEY_CHAT_OPTIONS
    );
    expect(parseSurveyChatOptions('x')).toBeNull();
    expect(parseSurveyChatOptions(null)).toBeNull();
  });
});
