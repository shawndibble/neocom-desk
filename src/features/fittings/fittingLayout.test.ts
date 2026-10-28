import { describe, expect, it } from 'vitest';
import { addModeFor, editorColumnClass, editorGridClass, leftColumn } from './fittingLayout';

describe('addModeFor', () => {
  it('docks on three columns, slides out on desktop, sheets below', () => {
    expect(addModeFor(true, true)).toBe('docked');
    expect(addModeFor(false, true)).toBe('slideOut');
    expect(addModeFor(false, false)).toBe('sheet');
  });
});

describe('editorGridClass', () => {
  it('docked ring caps the ring track', () => {
    expect(editorGridClass('docked', 'ring', false)).toContain('20rem_minmax(0,52rem)');
  });
  it('docked list lets the list take the width', () => {
    expect(editorGridClass('docked', 'list', false)).toContain('20rem_minmax(0,1fr)');
  });
  it('open slide-out stacks to one column', () => {
    expect(editorGridClass('slideOut', 'ring', true)).toContain('grid-cols-1');
    expect(editorGridClass('slideOut', 'ring', true)).not.toContain('lg:');
  });
  it('closed slide-out puts ring beside stats from lg, list from xl', () => {
    expect(editorGridClass('slideOut', 'ring', false)).toContain('lg:grid-cols-');
    expect(editorGridClass('slideOut', 'list', false)).not.toContain('lg:grid-cols-');
    expect(editorGridClass('slideOut', 'list', false)).toContain('xl:grid-cols-');
  });
});

describe('editorGridClass with Improve open', () => {
  it('pins the stats track and stops re-centring, so the stats never shift', () => {
    for (const view of ['ring', 'list'] as const) {
      const open = editorGridClass('slideOut', view, false, true);
      expect(open).not.toContain('minmax(22rem');
      expect(open).not.toContain('justify-center');
      expect(open).toContain('justify-start');
      expect(editorGridClass('docked', view, false, true)).not.toContain('26rem');
      // Same width shut or open, so opening Improve never resizes the stats.
      expect(editorGridClass('slideOut', view, false)).toContain('_22rem]');
    }
  });
});

describe('editorColumnClass', () => {
  it('sticks the ring column when docked or the browser is closed', () => {
    expect(editorColumnClass('ring', 'docked', true)).toContain('lg:sticky');
    expect(editorColumnClass('ring', 'slideOut', false)).toContain('lg:sticky');
  });
  it('does not stick the list or an open slide-out', () => {
    expect(editorColumnClass('list', 'docked', false)).not.toContain('sticky');
    expect(editorColumnClass('ring', 'slideOut', true)).not.toContain('sticky');
  });
});

describe('leftColumn', () => {
  const base = { statsFirst: false };
  it('leaves the page alone with nothing open', () => {
    expect(leftColumn('docked', false, false)).toEqual({
      ...base,
      addMode: 'docked',
      addOpen: false,
      pushed: false,
    });
  });

  it('pushes the page aside for the Add slide-out', () => {
    expect(leftColumn('slideOut', true, false)).toEqual({
      ...base,
      addMode: 'slideOut',
      addOpen: true,
      pushed: true,
    });
  });

  it('gives Improve the docked browser column: the browser steps aside, nothing is pushed', () => {
    // Improve is a column in the page itself, not an overlay the page must clear.
    expect(leftColumn('docked', false, true)).toEqual({
      ...base,
      addMode: 'slideOut',
      addOpen: false,
      pushed: false,
    });
  });

  it('on a narrower desktop, Improve puts the stats above the editor beside it', () => {
    // The column leaves no room for both side by side; the stats are what Improve changes.
    expect(leftColumn('slideOut', true, true)).toEqual({
      addMode: 'slideOut',
      addOpen: false,
      pushed: false,
      statsFirst: true,
    });
  });

  it('never pushes below desktop, where the stats are a tab of their own', () => {
    expect(leftColumn('sheet', true, true)).toEqual({
      ...base,
      addMode: 'sheet',
      addOpen: true,
      pushed: false,
    });
    expect(leftColumn('sheet', true, false)).toEqual({
      ...base,
      addMode: 'sheet',
      addOpen: true,
      pushed: false,
    });
  });
});
