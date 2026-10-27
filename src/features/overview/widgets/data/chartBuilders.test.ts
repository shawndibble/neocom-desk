import { describe, expect, it } from 'vitest';
import {
  hbarsFromRows,
  queueSegments,
  queueStack,
  severityColor,
  walletArea,
} from './chartBuilders';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const NOW = Date.parse('2026-10-11T12:00:00Z');

describe('hbarsFromRows', () => {
  it('is null for no rows', () => {
    expect(hbarsFromRows(t, [], 'note')).toBeNull();
  });

  it('scales shares to the largest and names every row in the summary', () => {
    const model = hbarsFromRows(
      t,
      [
        { key: 'a', label: 'Sisters', value: 800, text: '800' },
        { key: 'b', label: 'Navy', value: 400, text: '400' },
      ],
      'LP by corporation'
    )!;
    expect(model.rows.map((r) => r.share)).toEqual([1, 0.5]);
    expect(model.note).toBe('LP by corporation');
    expect(model.summary).toContain('Sisters 800, Navy 400');
  });

  it('honours an explicit share, for figures that are already a share of something', () => {
    const model = hbarsFromRows(
      t,
      [{ key: 'a', label: 'Jita', value: 82, share: 0.82, text: '82%' }],
      'n'
    )!;
    expect(model.rows[0]!.share).toBe(0.82);
  });
});

describe('severityColor', () => {
  it('puts warnings and worse in the warning hue and the rest in the accent, never in a series hue', () => {
    expect(severityColor('clear')).toBe('accent');
    expect(severityColor('watch')).toBe('accent');
    expect(severityColor('warning')).toBe('warning');
    expect(severityColor('critical')).toBe('warning');
  });
});

describe('walletArea', () => {
  it('needs two days to draw a line', () => {
    expect(walletArea(t, { days: ['2026-10-11'], values: [5] }, (n) => String(n))).toBeNull();
  });

  it('labels the low and high and names the span it actually has', () => {
    const model = walletArea(t, { days: ['a', 'b', 'c'], values: [3, 9, 5] }, (n) => `${n}B`)!;
    expect(model.low).toContain('"value":"3B"');
    expect(model.high).toContain('"value":"9B"');
    expect(model.rangeLabel).toContain('"count":3');
    expect(model.summary).toContain('"from":"3B"');
    expect(model.summary).toContain('"to":"5B"');
  });
});

describe('queueSegments', () => {
  const entry = (position: number, start: string | undefined, finish: string | undefined) => ({
    skill_id: 3300 + position,
    finished_level: 5,
    queue_position: position,
    start_date: start,
    finish_date: finish,
  });

  it('measures the running skill from now and later ones from their own start', () => {
    const segments = queueSegments(
      [
        entry(0, '2026-10-11T08:00:00Z', '2026-10-11T16:00:00Z'),
        entry(1, '2026-10-11T16:00:00Z', '2026-10-12T16:00:00Z'),
      ],
      NOW
    );
    expect(segments.map((s) => s.seconds)).toEqual([4 * 3600, 24 * 3600]);
  });

  it('falls back to the previous finish when a skill has no start', () => {
    const segments = queueSegments(
      [
        entry(0, '2026-10-11T08:00:00Z', '2026-10-11T16:00:00Z'),
        entry(1, undefined, '2026-10-11T20:00:00Z'),
      ],
      NOW
    );
    expect(segments.map((s) => s.seconds)).toEqual([4 * 3600, 4 * 3600]);
  });

  it('drops finished skills and ones with no finish time', () => {
    const segments = queueSegments(
      [
        entry(0, '2026-10-10T08:00:00Z', '2026-10-10T16:00:00Z'),
        entry(1, undefined, undefined),
        entry(2, '2026-10-11T12:00:00Z', '2026-10-11T14:00:00Z'),
      ],
      NOW
    );
    expect(segments.map((s) => s.entry.queue_position)).toEqual([2]);
  });
});

describe('queueStack', () => {
  const items = [
    { key: 'a', label: 'Gunnery V', seconds: 4 * 3600 },
    { key: 'b', label: 'Hull Upgrades IV', seconds: 20 * 3600 },
    { key: 'c', label: 'Mechanics V', seconds: 2 * 86_400 },
    { key: 'd', label: 'Navigation IV', seconds: 3600 },
  ];

  const stack = () => {
    const model = queueStack(t, items, (seconds) => `${seconds}s`);
    if (!model) throw new Error('no stack');
    return model;
  };

  it('is one bar, a part per skill sized by training time', () => {
    const model = stack();
    expect(model.kind).toBe('stack');
    expect(model.parts.map((p) => p.value)).toEqual(items.map((i) => i.seconds));
  });

  it('names only the first two skills in the legend, and the caption gives the queue end', () => {
    const model = stack();
    expect(model.parts.map((p) => p.unlabelled === true)).toEqual([false, false, true, true]);
    expect(model.parts[0]!.text).toBe('14400s');
    expect(model.note).toContain('"duration":"');
    expect(model.note).toContain(String(4 * 3600 + 20 * 3600 + 2 * 86_400 + 3600));
    expect(model.summary).toContain('Gunnery V');
    expect(model.summary).toContain('Navigation IV');
  });

  it('is null with an empty queue', () => {
    expect(queueStack(t, [], String)).toBeNull();
  });
});
