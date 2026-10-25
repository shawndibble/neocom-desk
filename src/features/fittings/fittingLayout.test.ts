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
  it('leaves the page alone with nothing open', () => {
    expect(leftColumn('docked', false, false)).toEqual({
      addMode: 'docked',
      addOpen: false,
      pushed: false,
    });
  });

  it('pushes the page aside for the Add slide-out', () => {
    expect(leftColumn('slideOut', true, false)).toEqual({
      addMode: 'slideOut',
      addOpen: true,
      pushed: true,
    });
  });

  it('gives Improve the docked browser column: the browser steps aside, the page makes room', () => {
    expect(leftColumn('docked', false, true)).toEqual({
      addMode: 'slideOut',
      addOpen: false,
      pushed: true,
    });
  });

  it('keeps an Add slide-out shut while Improve holds the column', () => {
    expect(leftColumn('slideOut', true, true)).toEqual({
      addMode: 'slideOut',
      addOpen: false,
      pushed: true,
    });
  });

  it('changes nothing on a phone, where both are sheets', () => {
    expect(leftColumn('sheet', true, false)).toEqual({
      addMode: 'sheet',
      addOpen: true,
      pushed: false,
    });
  });
});
