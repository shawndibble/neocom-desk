import { describe, expect, it } from 'vitest';
import {
  MAX_WIDGETS,
  addWidget,
  addWidgetUndoable,
  canAdd,
  duplicateWidget,
  duplicateWidgetUndoable,
  moveWidget,
  removeWidget,
  removeWidgetUndoable,
  renameWidget,
  resetLayout,
  resetLayoutUndoable,
  resizeWidget,
  resizeWidgetUndoable,
  restoreLayout,
  setRange,
  setCalendarEvents,
  setRaidsRadius,
  setRaidsWhere,
  setProfitSource,
  setTrendHubs,
  setTrendItems,
  setPlexPer30Days,
  setRowsPerPage,
  newWidget,
  setScope,
  setShow,
  setShowOnPhone,
  setView,
  snapshotLayout,
  stepWidget,
  moveToWidget,
  type OverviewLayout,
  type Widget,
} from './layout';
import { DEFAULT_ROWS_PER_PAGE } from './tableSortPage';

function counter(prefix = 'w') {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function w(id: string, kind: string, extra: Partial<Widget> = {}): Widget {
  return { id, kind, size: 'S', view: 'number', scope: 'header', showOnPhone: true, ...extra };
}

function layoutOf(...ws: Widget[]): OverviewLayout {
  return { version: 1, widgets: ws };
}

const ids = (l: OverviewLayout) => l.widgets.map((x) => x.id);

describe('addWidget', () => {
  it('appends with the kind defaults', () => {
    const next = addWidget(layoutOf(w('a', 'wallet')), 'orders', counter());
    expect(next.widgets).toHaveLength(2);
    expect(next.widgets[1]).toEqual({
      id: 'w1',
      kind: 'orders',
      size: 'L',
      view: 'table',
      scope: 'header',
      showOnPhone: true,
    });
  });

  it('starts a ranged kind on 30 days', () => {
    const next = addWidget(layoutOf(), 'wallet', counter());
    expect(next.widgets[0].range).toBe(30);
  });

  it('allows the same kind twice', () => {
    const l = addWidget(addWidget(layoutOf(), 'orders', counter()), 'orders', counter('x'));
    expect(l.widgets.filter((x) => x.kind === 'orders')).toHaveLength(2);
  });

  it('never mutates its input', () => {
    const before = layoutOf(w('a', 'wallet'));
    const copy = structuredClone(before);
    addWidget(before, 'orders', counter());
    expect(before).toEqual(copy);
  });

  it('skips an id makeId hands out that is already taken', () => {
    const seq = ['a', 'a', 'b'];
    const next = addWidget(layoutOf(w('a', 'wallet')), 'orders', () => seq.shift()!);
    expect(ids(next)).toEqual(['a', 'b']);
  });

  it('refuses an unknown kind', () => {
    const l = layoutOf();
    expect(addWidget(l, 'someFutureKind', counter())).toBe(l);
  });

  it('stops at the soft limit', () => {
    let l = layoutOf();
    const mk = counter();
    for (let i = 0; i < MAX_WIDGETS + 5; i++) l = addWidget(l, 'mail', mk);
    expect(l.widgets).toHaveLength(MAX_WIDGETS);
  });
});

describe('canAdd', () => {
  it('is true below the limit and false at it', () => {
    expect(canAdd(layoutOf())).toBe(true);
    const full = layoutOf(...Array.from({ length: MAX_WIDGETS }, (_, i) => w(`i${i}`, 'mail')));
    expect(canAdd(full)).toBe(false);
  });

  it('is false for a kind that cannot be added', () => {
    expect(canAdd(layoutOf(), 'someFutureKind')).toBe(false);
    expect(canAdd(layoutOf(), 'mail')).toBe(true);
  });
});

describe('removeWidget', () => {
  it('removes by id and ignores an unknown id', () => {
    const l = layoutOf(w('a', 'wallet'), w('b', 'mail'));
    expect(ids(removeWidget(l, 'a'))).toEqual(['b']);
    expect(removeWidget(l, 'zzz')).toBe(l);
  });
});

describe('moveWidget', () => {
  const l = layoutOf(w('a', 'wallet'), w('b', 'mail'), w('c', 'orders'), w('d', 'lp'));

  it('moves up and down by one', () => {
    expect(ids(moveWidget(l, 'c', 'up'))).toEqual(['a', 'c', 'b', 'd']);
    expect(ids(moveWidget(l, 'b', 'down'))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('moves to top and bottom', () => {
    expect(ids(moveWidget(l, 'c', 'top'))).toEqual(['c', 'a', 'b', 'd']);
    expect(ids(moveWidget(l, 'b', 'bottom'))).toEqual(['a', 'c', 'd', 'b']);
  });

  it('moves to an index, clamped', () => {
    expect(ids(moveWidget(l, 'a', 2))).toEqual(['b', 'c', 'a', 'd']);
    expect(ids(moveWidget(l, 'd', 0))).toEqual(['d', 'a', 'b', 'c']);
    expect(ids(moveWidget(l, 'a', 99))).toEqual(['b', 'c', 'd', 'a']);
    expect(ids(moveWidget(l, 'd', -5))).toEqual(['d', 'a', 'b', 'c']);
  });

  it('returns the same layout when nothing would move', () => {
    expect(moveWidget(l, 'a', 'up')).toBe(l);
    expect(moveWidget(l, 'd', 'down')).toBe(l);
    expect(moveWidget(l, 'a', 'top')).toBe(l);
    expect(moveWidget(l, 'd', 'bottom')).toBe(l);
    expect(moveWidget(l, 'zzz', 'up')).toBe(l);
  });
});

describe('resizeWidget', () => {
  it('sets the size', () => {
    const l = layoutOf(w('a', 'wallet'));
    expect(resizeWidget(l, 'a', 'L').widgets[0].size).toBe('L');
  });
  it('is a no-op for the same size', () => {
    const l = layoutOf(w('a', 'wallet'));
    expect(resizeWidget(l, 'a', 'S')).toBe(l);
  });
});

describe('setView', () => {
  it('accepts a view the kind has', () => {
    const l = layoutOf(w('a', 'wallet'));
    expect(setView(l, 'a', 'chart').widgets[0].view).toBe('chart');
  });
  it('refuses a view the kind lacks', () => {
    const l = layoutOf(w('a', 'sp'), w('b', 'priceWatch'));
    expect(setView(l, 'a', 'chart')).toBe(l);
    expect(setView(l, 'b', 'chart')).toBe(l);
  });
  it('refuses an unknown kind', () => {
    const l = layoutOf(w('a', 'future'));
    expect(setView(l, 'a', 'table')).toBe(l);
  });
});

describe('setScope', () => {
  it('toggles between header and all', () => {
    const l = layoutOf(w('a', 'orders'));
    const all = setScope(l, 'a', 'all');
    expect(all.widgets[0].scope).toBe('all');
    expect(setScope(all, 'a', 'header').widgets[0].scope).toBe('header');
    expect(setScope(all, 'a', 'all')).toBe(all);
  });
});

describe('setRange', () => {
  it('sets the range only for kinds that have one', () => {
    const l = layoutOf(w('a', 'wallet', { range: 30 }), w('b', 'orders'));
    expect(setRange(l, 'a', 7).widgets[0].range).toBe(7);
    expect(setRange(l, 'b', 7)).toBe(l);
  });
});

describe('a year of range', () => {
  it('is offered by Market Trend alone', () => {
    const l = layoutOf(w('a', 'marketTrend', { range: 30 }), w('b', 'wallet', { range: 30 }));
    expect(setRange(l, 'a', 365).widgets[0].range).toBe(365);
    expect(setRange(l, 'b', 365)).toBe(l);
  });
});

describe('addWidget trendHubs init', () => {
  const empty = layoutOf();

  it('applies cleaned hubs to a kind with trend sources, copied not aliased', () => {
    const hubs = ['jita', 'nowhere', 'jita'];
    const next = addWidget(empty, 'marketTrend', counter(), { trendHubs: hubs });
    expect(next.widgets[0].trendHubs).toEqual(['jita']);
    next.widgets[0].trendHubs!.push('amarr');
    expect(hubs).toEqual(['jita', 'nowhere', 'jita']);
  });

  it('leaves no trendHubs when none are valid, and ignores them on other kinds', () => {
    expect(
      addWidget(empty, 'marketTrend', counter(), { trendHubs: ['x'] }).widgets[0]
    ).not.toHaveProperty('trendHubs');
    expect(
      addWidget(empty, 'wallet', counter(), { trendHubs: ['jita'] }).widgets[0]
    ).not.toHaveProperty('trendHubs');
  });
});

describe('setTrendItems and setTrendHubs', () => {
  const l = layoutOf(w('a', 'marketTrend'), w('b', 'wallet'));

  it('stores the picks, deduplicated and capped at six items', () => {
    const next = setTrendItems(l, 'a', [34, 34, 35, 36, 37, 38, 39, 40]);
    expect(next.widgets[0].trendItems).toEqual([34, 35, 36, 37, 38, 39]);
  });

  it('drops junk and clears when nothing valid is left', () => {
    const set = setTrendItems(l, 'a', [34]);
    const cleared = setTrendItems(set, 'a', ['x', -1, 1.5]);
    expect(cleared.widgets[0]).not.toHaveProperty('trendItems');
  });

  it('keeps the very same layout when nothing changes or the kind has no sources', () => {
    const set = setTrendItems(l, 'a', [34]);
    expect(setTrendItems(set, 'a', [34])).toBe(set);
    expect(setTrendItems(l, 'b', [34])).toBe(l);
    expect(setTrendHubs(l, 'b', ['jita'])).toBe(l);
  });

  it('keeps known hubs only, at most three', () => {
    const next = setTrendHubs(l, 'a', ['jita', 'nowhere', 'amarr', 'rens', 'hek']);
    expect(next.widgets[0].trendHubs).toEqual(['jita', 'amarr', 'rens']);
    expect(setTrendHubs(next, 'a', []).widgets[0]).not.toHaveProperty('trendHubs');
  });
});

describe('setPlexPer30Days', () => {
  it('a new Omega coverage widget reads every Character; other kinds the header', () => {
    expect(newWidget('omega', 'a')!.scope).toBe('all');
    expect(newWidget('orders', 'a')!.scope).toBe('header');
  });

  it('stores a non-default plan and drops the field when it goes back to 500', () => {
    const l = layoutOf(w('a', 'omega'));
    const plan = setPlexPer30Days(l, 'a', 1200);
    expect(plan.widgets[0].plexPer30Days).toBe(1200);
    expect('plexPer30Days' in setPlexPer30Days(plan, 'a', 500).widgets[0]).toBe(false);
  });

  it('changes nothing for the default, a bad plan or a kind with no plan', () => {
    const l = layoutOf(w('a', 'omega'), w('b', 'orders'));
    expect(setPlexPer30Days(l, 'a', 500)).toBe(l);
    expect(setPlexPer30Days(l, 'a', 0)).toBe(l);
    expect(setPlexPer30Days(l, 'a', 1.5)).toBe(l);
    expect(setPlexPer30Days(l, 'a', 99999)).toBe(l);
    expect(setPlexPer30Days(l, 'b', 700)).toBe(l);
  });
});

describe('setRaidsWhere and setRaidsRadius', () => {
  it('stores Near me and drops the field when it goes back to My alliance', () => {
    const l = layoutOf(w('a', 'sovRaids'));
    const near = setRaidsWhere(l, 'a', 'near');
    expect(near.widgets[0].raidsWhere).toBe('near');
    expect('raidsWhere' in setRaidsWhere(near, 'a', 'alliance').widgets[0]).toBe(false);
  });

  it('stores a radius other than 8 and drops it when it goes back to 8', () => {
    const l = layoutOf(w('a', 'sovRaids'));
    const wide = setRaidsRadius(l, 'a', 15);
    expect(wide.widgets[0].raidsRadius).toBe(15);
    expect('raidsRadius' in setRaidsRadius(wide, 'a', 8).widgets[0]).toBe(false);
  });

  it('changes nothing for the default, an unoffered radius or another kind', () => {
    const l = layoutOf(w('a', 'sovRaids'), w('b', 'orders'));
    expect(setRaidsWhere(l, 'a', 'alliance')).toBe(l);
    expect(setRaidsWhere(l, 'b', 'near')).toBe(l);
    expect(setRaidsRadius(l, 'a', 8)).toBe(l);
    expect(setRaidsRadius(l, 'a', 7)).toBe(l);
    expect(setRaidsRadius(l, 'b', 5)).toBe(l);
  });
});

describe('setProfitSource', () => {
  it('opens a new Profit widget on Both', () => {
    expect(newWidget('profit', 'a')?.profitSource).toBe('both');
    expect('profitSource' in newWidget('wallet', 'b')!).toBe(false);
  });

  it('stores every choice, Builds included, since absent already means Builds', () => {
    const l = layoutOf(w('a', 'profit', { profitSource: 'both' }));
    const builds = setProfitSource(l, 'a', 'builds');
    expect(builds.widgets[0].profitSource).toBe('builds');
    expect(setProfitSource(builds, 'a', 'trading').widgets[0].profitSource).toBe('trading');
  });

  it('changes nothing for the current choice, absent read as Builds, or another kind', () => {
    const l = layoutOf(w('a', 'profit'), w('b', 'orders'));
    expect(setProfitSource(l, 'a', 'builds')).toBe(l);
    expect(setProfitSource(l, 'b', 'trading')).toBe(l);
    expect(setProfitSource(l, 'a', 'everything' as never)).toBe(l);
  });
});

describe('setShow', () => {
  it('stores a Show other than the default and drops it on the default, keeping view and range', () => {
    const l = layoutOf(w('a', 'corpWallet', { view: 'chart', range: 90 }));
    const sources = setShow(l, 'a', 'sources');
    expect(sources.widgets[0]).toEqual({ ...l.widgets[0], show: 'sources' });
    expect('show' in setShow(sources, 'a', 'divisions').widgets[0]).toBe(false);
  });

  it('changes nothing for the current Show, one the kind lacks, or a kind without one', () => {
    const l = layoutOf(w('a', 'wallet'), w('b', 'orders'));
    expect(setShow(l, 'a', 'balance')).toBe(l);
    expect(setShow(l, 'a', 'divisions')).toBe(l);
    expect(setShow(l, 'b', 'flow')).toBe(l);
  });
});

describe('newWidget and addWidget with a Show', () => {
  it('opens on the chosen Show, stored only when it is not the default', () => {
    expect(newWidget('wallet', 'a', 'flow')).toMatchObject({ kind: 'wallet', show: 'flow' });
    expect('show' in newWidget('wallet', 'a', 'balance')!).toBe(false);
    expect('show' in newWidget('orders', 'a', 'flow')!).toBe(false);
    const added = addWidget(layoutOf(), 'corpWallet', counter(), { show: 'sources' });
    expect(added.widgets[0]).toMatchObject({ kind: 'corpWallet', show: 'sources', range: 30 });
  });
});

describe('setCalendarEvents', () => {
  it('stores All events and drops the field when it goes back to the default', () => {
    const l = layoutOf(w('a', 'comingUp'));
    const all = setCalendarEvents(l, 'a', 'all');
    expect(all.widgets[0].calendarEvents).toBe('all');
    expect('calendarEvents' in setCalendarEvents(all, 'a', 'committed').widgets[0]).toBe(false);
  });

  it('changes nothing for the default or a kind with no event choice', () => {
    const l = layoutOf(w('a', 'comingUp'), w('b', 'orders'));
    expect(setCalendarEvents(l, 'a', 'committed')).toBe(l);
    expect(setCalendarEvents(l, 'b', 'all')).toBe(l);
  });
});

describe('the Structures Show', () => {
  it('stores Problems only and drops the field when it goes back to All', () => {
    const l = layoutOf(w('a', 'structures'));
    const problems = setShow(l, 'a', 'problems');
    expect(problems.widgets[0].show).toBe('problems');
    expect('show' in setShow(problems, 'a', 'all').widgets[0]).toBe(false);
    expect(setShow(l, 'a', 'all')).toBe(l);
  });
});

describe('setRowsPerPage', () => {
  it('stores a non-default page size and drops the field when it goes back to the default', () => {
    const l = layoutOf(w('a', 'orders'));
    const five = setRowsPerPage(l, 'a', 5);
    expect(five.widgets[0].rowsPerPage).toBe(5);
    const back = setRowsPerPage(five, 'a', DEFAULT_ROWS_PER_PAGE);
    expect('rowsPerPage' in back.widgets[0]).toBe(false);
  });

  it('returns the same layout when nothing changes or the size is not offered', () => {
    const l = layoutOf(w('a', 'orders', { rowsPerPage: 25 }));
    expect(setRowsPerPage(l, 'a', 25)).toBe(l);
    const plain = layoutOf(w('a', 'orders'));
    expect(setRowsPerPage(plain, 'a', DEFAULT_ROWS_PER_PAGE)).toBe(plain);
    expect(setRowsPerPage(l, 'a', 7 as never)).toBe(l);
    expect(setRowsPerPage(l, 'missing', 5)).toBe(l);
  });
});

describe('renameWidget', () => {
  it('sets a trimmed title', () => {
    const l = layoutOf(w('a', 'wallet'));
    expect(renameWidget(l, 'a', '  Main ISK ').widgets[0].title).toBe('Main ISK');
  });
  it('clears the title on an empty string', () => {
    const l = layoutOf(w('a', 'wallet', { title: 'Main' }));
    const next = renameWidget(l, 'a', '   ');
    expect(next.widgets[0].title).toBeUndefined();
    expect('title' in next.widgets[0]).toBe(false);
  });
});

describe('setShowOnPhone', () => {
  it('toggles the flag', () => {
    const l = layoutOf(w('a', 'wallet'));
    expect(setShowOnPhone(l, 'a', false).widgets[0].showOnPhone).toBe(false);
    expect(setShowOnPhone(l, 'a', true)).toBe(l);
  });
});

describe('duplicateWidget', () => {
  it('inserts right after the source with a new id and no title', () => {
    const l = layoutOf(
      w('a', 'orders', { title: 'Mine', size: 'L', view: 'table' }),
      w('b', 'mail')
    );
    const next = duplicateWidget(l, 'a', counter('d'));
    expect(ids(next)).toEqual(['a', 'd1', 'b']);
    expect(next.widgets[1]).toMatchObject({ kind: 'orders', size: 'L', view: 'table' });
    expect(next.widgets[1].title).toBeUndefined();
    expect(next.widgets[0].title).toBe('Mine');
  });
  it('respects the limit and unknown ids', () => {
    const full = layoutOf(...Array.from({ length: MAX_WIDGETS }, (_, i) => w(`i${i}`, 'mail')));
    expect(duplicateWidget(full, 'i0', counter())).toBe(full);
    expect(duplicateWidget(layoutOf(), 'x', counter()).widgets).toHaveLength(0);
  });
});

describe('resetLayout and snapshots', () => {
  it('replaces the layout with a copy of the default', () => {
    const def = layoutOf(w('x', 'wallet'));
    const next = resetLayout(def);
    expect(next).toEqual(def);
    expect(next).not.toBe(def);
    expect(next.widgets).not.toBe(def.widgets);
  });

  it('Cancel restores exactly what Customize started with', () => {
    const start = layoutOf(w('a', 'wallet'), w('b', 'orders', { title: 'T' }));
    const snap = snapshotLayout(start);
    let cur = removeWidget(start, 'a');
    cur = renameWidget(cur, 'b', 'Changed');
    cur = addWidget(cur, 'mail', counter());
    expect(restoreLayout(snap)).toEqual(start);
    expect(cur).not.toEqual(start);
  });

  it('a snapshot is unaffected by later changes to the original object', () => {
    const start = layoutOf(w('a', 'wallet'));
    const snap = snapshotLayout(start);
    start.widgets[0].size = 'F';
    expect(snap.widgets[0].size).toBe('S');
    const restored = restoreLayout(snap);
    restored.widgets[0].size = 'M';
    expect(snap.widgets[0].size).toBe('S');
  });
});

describe('undoable actions', () => {
  it('add carries the label and the previous layout', () => {
    const before = layoutOf(w('a', 'wallet'));
    const r = addWidgetUndoable(before, 'orders', counter())!;
    expect(r.layout.widgets).toHaveLength(2);
    expect(r.undoLabel).toBe('overview.customize.undo.added');
    expect(r.undoTo).toEqual(before);
  });
  it('remove, resize, duplicate and reset each carry a label', () => {
    const before = layoutOf(w('a', 'wallet'), w('b', 'mail'));
    expect(removeWidgetUndoable(before, 'a')!.undoLabel).toBe('overview.customize.undo.removed');
    expect(resizeWidgetUndoable(before, 'a', 'M')!.undoLabel).toBe(
      'overview.customize.undo.resized'
    );
    expect(duplicateWidgetUndoable(before, 'a', counter())!.undoLabel).toBe(
      'overview.customize.undo.duplicated'
    );
    const reset = resetLayoutUndoable(before, layoutOf())!;
    expect(reset.undoLabel).toBe('overview.customize.undo.reset');
    expect(reset.undoTo).toEqual(before);
  });
  it('returns null when the action changed nothing, so no toast is raised', () => {
    const before = layoutOf(w('a', 'wallet'));
    expect(resizeWidgetUndoable(before, 'a', 'S')).toBeNull();
    expect(removeWidgetUndoable(before, 'nope')).toBeNull();
    expect(addWidgetUndoable(before, 'someFutureKind', counter())).toBeNull();
  });
  it('undoTo is a copy, immune to later mutation', () => {
    const before = layoutOf(w('a', 'wallet'));
    const r = removeWidgetUndoable(before, 'a')!;
    before.widgets[0].size = 'F';
    expect(r.undoTo.widgets[0].size).toBe('S');
  });
});

describe('stepWidget', () => {
  const drawn = (x: Widget) => x.kind !== 'future';
  it('steps to the neighbour that is drawn, hopping over one that is not', () => {
    const l = layoutOf(w('a', 'wallet'), w('x', 'future'), w('b', 'mail'));
    expect(ids(stepWidget(l, 'b', 'earlier', drawn))).toEqual(['b', 'a', 'x']);
    expect(ids(stepWidget(l, 'a', 'later', drawn))).toEqual(['x', 'b', 'a']);
  });
  it('does nothing at either end', () => {
    const l = layoutOf(w('a', 'wallet'), w('b', 'mail'));
    expect(stepWidget(l, 'a', 'earlier', drawn)).toBe(l);
    expect(stepWidget(l, 'b', 'later', drawn)).toBe(l);
  });
  it('does nothing for an unknown id', () => {
    const l = layoutOf(w('a', 'wallet'));
    expect(stepWidget(l, 'zz', 'later', drawn)).toBe(l);
  });
});

describe('moveToIndexOfWidget', () => {
  it('drops a widget where another sits, by id, in the full list', () => {
    const l = layoutOf(w('a', 'wallet'), w('x', 'future'), w('b', 'mail'), w('c', 'orders'));
    expect(ids(moveToWidget(l, 'a', 'c'))).toEqual(['x', 'b', 'c', 'a']);
    expect(ids(moveToWidget(l, 'c', 'a'))).toEqual(['c', 'a', 'x', 'b']);
  });
  it('is the same layout for the same id or an unknown one', () => {
    const l = layoutOf(w('a', 'wallet'), w('b', 'mail'));
    expect(moveToWidget(l, 'a', 'a')).toBe(l);
    expect(moveToWidget(l, 'a', 'nope')).toBe(l);
  });
});
