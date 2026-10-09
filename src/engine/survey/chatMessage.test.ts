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
  cracking: 'Rocks cracking',
  halfway: 'Halfway there',
  almost: 'Almost clear',
  last: 'Last rocks!',
  done: 'done <b>{time} EVE</b> (~{left})',
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
  it('writes status, finish time, bar, ore line and link', () => {
    // 930 m3 mined in 900 s, 70 left at 1.0333 m3/s: about 68 s to go
    const s = summarizeSurvey([
      scan(0, ['Glistening Sylvite', 800], ['Glistening Bitumens', 200]),
      scan(15, ['Glistening Sylvite', 40], ['Glistening Sylvite', 20], ['Glistening Bitumens', 10]),
    ])!;
    const lines = surveyChatMessage(s, URL, labels).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('Almost clear · done <b>16:56 EVE</b> (~1m)');
    expect(lines[1]).toBe('▕' + '█'.repeat(18) + '░░' + '▏ 93%');
    expect(lines[2]).toBe('Left: 2 Sylvite · 1 Bitumens');
    expect(lines[3]).toBe(URL);
  });

  it('shows hours and minutes when long', () => {
    // 1 m3/s with 9400 s left is 2h 36m 40s
    const s = summarizeSurvey([scan(0, ['A', 10_000]), scan(10, ['A', 9_400])])!;
    expect(surveyChatMessage(s, URL, labels).split('\n')[0]).toContain('(~2h 37m)');
  });

  it('with one scan says it is waiting for a second', () => {
    const s = summarizeSurvey([scan(0, ['A', 10_000])])!;
    expect(surveyChatMessage(s, URL, labels).split('\n')[0]).toBe(
      'Rocks cracking · waiting for a second scan'
    );
  });

  it('picks the status word by progress', () => {
    const word = (left: number) =>
      surveyChatMessage(
        summarizeSurvey([scan(0, ['A', 1000]), scan(5, ['A', left])])!,
        URL,
        labels
      ).split(' · ')[0];
    expect(word(900)).toBe('Rocks cracking'); // 10%
    expect(word(750)).toBe('Halfway there'); // 25%
    expect(word(260)).toBe('Halfway there'); // 74%
    expect(word(250)).toBe('Almost clear'); // 75%
    expect(word(60)).toBe('Almost clear'); // 94%
    expect(word(50)).toBe('Last rocks!'); // 95%
  });

  it('names the three biggest ores and counts the rocks of the rest as one group', () => {
    const s = summarizeSurvey([
      scan(0, ['A', 5], ['B', 4], ['C', 3], ['D', 2], ['E', 1], ['E', 1]),
    ])!;
    expect(surveyChatMessage(s, URL, labels).split('\n')[2]).toBe(
      'Left: 1 A · 1 B · 1 C · 3 other'
    );
  });

  it('calls out ores by the ISK left in them, with how many rocks each has', () => {
    // Veldspar 20 rocks worth 10M, Scordite 5 worth 25M, Pyroxeres 15 worth 12M, Kernite 4 worth 3M.
    const rocks = (ore: string, count: number, each: number) =>
      Array.from({ length: count }, () => ({ ore, volume: 100, isk: each }));
    const s = summarizeSurvey([
      {
        at: T0,
        rocks: [
          ...rocks('Veldspar', 20, 500_000),
          ...rocks('Scordite', 5, 5_000_000),
          ...rocks('Pyroxeres', 15, 800_000),
          ...rocks('Kernite', 4, 750_000),
        ],
      },
    ])!;
    expect(surveyChatMessage(s, URL, labels).split('\n')[2]).toBe(
      'Left: 5 Scordite · 15 Pyroxeres · 20 Veldspar · 4 other'
    );
  });

  it('a cleared field is three lines with the full bar and elapsed time', () => {
    const s = summarizeSurvey([scan(0, ['A', 1000]), scan(176)])!;
    expect(surveyChatMessage(s, URL, labels)).toBe(
      ['Field cleared in 2h 56m', '▕' + '█'.repeat(20) + '▏ 100%', URL].join('\n')
    );
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
    for (const line of lines.slice(0, 3)) expect(visible(line)).toBeLessThanOrEqual(MAX_LINE_WIDTH);
    expect(lines[2]).toMatch(/^Left: .* · \d+ other$/);
  });

  it('never drops the biggest ore, even when its name alone is long', () => {
    const s = summarizeSurvey([
      scan(0, ['An Extremely Long Ore Name Indeed Mercoxit II-Grade', 5]),
    ])!;
    expect(surveyChatMessage(s, URL, labels).split('\n')[2]).toContain('Extremely');
  });
});
