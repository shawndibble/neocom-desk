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

/**
 * The settled body heights below were measured in Chromium on the default board (1350px and
 * 390px wide) with a full set of data; the estimate is pinned to within a pixel of them, since
 * every pixel it is off moves the widgets under it when the data lands.
 */
function expectNear(actual: number, settled: number) {
  expect(Math.abs(actual - settled), `${actual} vs settled ${settled}`).toBeLessThanOrEqual(1);
}

const est = (
  kind: string,
  view: 'number' | 'chart' | 'table',
  size: 'S' | 'M' | 'L' | 'F',
  phone: boolean,
  rowsPerPage?: 5 | 10 | 25
) => estimatedBodyHeight({ kind, view, size, rowsPerPage }, phone);

describe('estimatedBodyHeight', () => {
  it('reserves a headline and its secondary line for the Number view at every size', () => {
    expectNear(est('training', 'number', 'S', false), 73.5);
    expect(est('training', 'number', 'S', false)).toBe(est('sp', 'number', 'F', true));
  });

  it('reserves the header row and the size rows for the Table view, plain rows taller on a phone', () => {
    // Coming up at Medium: the headline, a labelled header row and five rows.
    expectNear(est('comingUp', 'table', 'M', false), 216);
    expectNear(est('comingUp', 'table', 'M', true), 236);
    expect(est('comingUp', 'table', 'L', false)).toBeGreaterThan(
      est('comingUp', 'table', 'M', false)
    );
  });

  it('adds the "+N more" line for a kind whose list is longer than the size\'s cut', () => {
    expectNear(est('mail', 'table', 'M', false), 253);
    expectNear(est('mail', 'table', 'M', true), 281);
  });

  it("reserves Open orders' sortable header, pager and slots footer", () => {
    expectNear(est('orders', 'table', 'L', false), 374.8);
    expectNear(est('orders', 'table', 'L', true), 438);
  });

  it("reserves a paged table's chosen page and its pager instead of the size's cut", () => {
    const cut = est('orders', 'table', 'M', false);
    expect(est('orders', 'table', 'M', false, 25)).toBeGreaterThan(cut + 20 * 28);
    expect(est('orders', 'table', 'M', false, 5)).toBeGreaterThan(cut);
    expect(est('orders', 'number', 'M', false, 25)).toBe(est('orders', 'number', 'M', false));
  });

  it("reserves the headline, the size's plot and its axis line for the Chart view", () => {
    expectNear(est('wallet', 'chart', 'S', false), 148);
    // A Small tile on a phone is narrow enough that the axis labels take two lines.
    expectNear(est('wallet', 'chart', 'S', true), 164.5);
    expect(est('wallet', 'chart', 'L', false)).toBeGreaterThan(est('wallet', 'chart', 'S', false));
  });

  it("reserves a kind's own drawing when it is not a plotted series", () => {
    // LP: horizontal bars with a caption.
    expectNear(est('lp', 'chart', 'M', false), 166);
    // Net worth on a device's first load: one day recorded, so the single stacked bar.
    expectNear(est('netWorth', 'chart', 'M', false), 142.5);
    // Build profit: labelled bars, an axis line and a caption.
    expectNear(est('profit', 'chart', 'M', false), 197);
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
