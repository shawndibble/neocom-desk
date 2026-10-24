// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  estimatedBodyHeight,
  heightKey,
  rememberBodyHeight,
  rememberedBodyHeight,
  resetRememberedHeights,
  WRITE_DELAY_MS,
} from './skeletonHeight';
import { TABLE_ROWS } from './tableModel';
import { chartHeight } from './sizes';

describe('estimatedBodyHeight', () => {
  it('reserves a headline for the Number view at every size', () => {
    expect(estimatedBodyHeight('number', 'S', false)).toBe(
      estimatedBodyHeight('number', 'F', true)
    );
  });

  it("reserves the size's chart under the headline for the Chart view", () => {
    const number = estimatedBodyHeight('number', 'M', false);
    expect(estimatedBodyHeight('chart', 'M', false)).toBeGreaterThanOrEqual(number + chartHeight.M);
    expect(estimatedBodyHeight('chart', 'L', false)).toBeGreaterThan(
      estimatedBodyHeight('chart', 'S', false)
    );
  });

  it("reserves the size's rows for the Table view, taller rows on a phone", () => {
    const desk = estimatedBodyHeight('table', 'L', false);
    expect(desk).toBeGreaterThan(estimatedBodyHeight('table', 'M', false));
    expect(desk).toBeGreaterThanOrEqual(TABLE_ROWS.L * 28);
    expect(estimatedBodyHeight('table', 'M', true)).toBeGreaterThan(
      estimatedBodyHeight('table', 'M', false)
    );
  });

  it("reserves a paged table's chosen page and its pager instead of the size's cut", () => {
    const cut = estimatedBodyHeight('table', 'M', false);
    expect(estimatedBodyHeight('table', 'M', false, 25)).toBeGreaterThan(cut + 20 * 28);
    expect(estimatedBodyHeight('table', 'M', false, 5)).toBeGreaterThan(cut);
    expect(estimatedBodyHeight('number', 'M', false, 25)).toBe(
      estimatedBodyHeight('number', 'M', false)
    );
  });
});

describe('remembered heights', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetRememberedHeights();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const widget = { id: 'w1', view: 'table' as const, size: 'M' as const };

  it('keys on the widget, its view and size, the Character and the phone layout', () => {
    expect(heightKey(widget, 7, false)).not.toBe(heightKey(widget, 7, true));
    expect(heightKey(widget, 7, false)).not.toBe(heightKey(widget, 8, false));
    expect(heightKey(widget, 7, false)).not.toBe(heightKey({ ...widget, size: 'L' }, 7, false));
  });

  it('keys a table on its page size, and ignores it for the other views', () => {
    expect(heightKey(widget, 7, false)).not.toBe(
      heightKey({ ...widget, rowsPerPage: 25 }, 7, false)
    );
    const chart = { ...widget, view: 'chart' as const };
    expect(heightKey(chart, 7, false)).toBe(heightKey({ ...chart, rowsPerPage: 25 }, 7, false));
  });

  it('writes to storage once, after the heights stop changing', () => {
    const key = heightKey(widget, 7, false);
    for (let px = 200; px < 260; px += 1) rememberBodyHeight(key, px);
    expect(localStorage.getItem('overview.widgetHeights')).toBeNull();
    expect(rememberedBodyHeight(key)).toBe(259);
    vi.advanceTimersByTime(WRITE_DELAY_MS);
    expect(JSON.parse(localStorage.getItem('overview.widgetHeights')!)).toEqual({ [key]: 259 });
  });

  it('is absent until a settled height is remembered, then survives a reload', () => {
    const key = heightKey(widget, 7, false);
    expect(rememberedBodyHeight(key)).toBeUndefined();
    rememberBodyHeight(key, 212.4);
    expect(rememberedBodyHeight(key)).toBe(212);
    vi.advanceTimersByTime(WRITE_DELAY_MS);
    resetRememberedHeights();
    expect(rememberedBodyHeight(key)).toBe(212);
  });

  it('ignores a zero height (a hidden or unmounted body)', () => {
    const key = heightKey(widget, 7, false);
    rememberBodyHeight(key, 0);
    expect(rememberedBodyHeight(key)).toBeUndefined();
  });

  it('keeps only the most recent entries', () => {
    for (let i = 0; i < 150; i += 1) rememberBodyHeight(`k${i}`, 100 + i);
    vi.advanceTimersByTime(WRITE_DELAY_MS);
    resetRememberedHeights();
    expect(rememberedBodyHeight('k0')).toBeUndefined();
    expect(rememberedBodyHeight('k149')).toBe(249);
  });

  it('survives storage that throws or holds junk', () => {
    localStorage.setItem('overview.widgetHeights', '{not json');
    resetRememberedHeights();
    expect(rememberedBodyHeight('anything')).toBeUndefined();
  });
});
