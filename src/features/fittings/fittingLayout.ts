import type { FittingView } from './fittingViewPreference';

/**
 * Wide enough for browser | Ring | stats side by side: the 12rem nav, a 20rem
 * browser, a Ring column wide enough for a ring of ~36rem (it grows to 48rem when
 * there's more), and
 * 22-26rem of stats, with gaps and page padding.
 */
export const THREE_COLUMN_QUERY = '(min-width: 100rem)';

export type AddMode = 'docked' | 'slideOut' | 'sheet';

export function addModeFor(threeColumns: boolean, isDesktop: boolean): AddMode {
  return threeColumns ? 'docked' : isDesktop ? 'slideOut' : 'sheet';
}

/**
 * Who holds the page's left column, and whether the page is pushed aside for it.
 * Improve open on desktop (`improveDocked`) takes the column: the docked browser
 * steps aside (laid out as a shut slide-out), an Add slide-out stays shut, and the
 * page makes room, so the stats stay in view while rows are ticked. On three
 * columns' width the stats keep their place beside the editor; narrower, the
 * 26rem leaves no room for both, so the stats go above the editor (`statsFirst`):
 * they are what Improve changes. Below desktop nothing is pushed: the stats are a
 * tab of their own there. Otherwise the Add slide-out pushes the page as before.
 */
export function leftColumn(
  addMode: AddMode,
  addOpen: boolean,
  improveDocked: boolean
): { addMode: AddMode; addOpen: boolean; pushed: boolean; statsFirst: boolean } {
  if (improveDocked && addMode !== 'sheet') {
    return {
      addMode: 'slideOut',
      addOpen: false,
      pushed: true,
      statsFirst: addMode === 'slideOut',
    };
  }
  return { addMode, addOpen, pushed: addOpen && addMode === 'slideOut', statsFirst: false };
}

/**
 * Docked: browser | Ring | stats. Otherwise the editor beside the
 * stats when wide, but stacked while the slide-out has pushed the
 * page aside, so the editor keeps the width rather than the stats.
 * The Ring goes beside them from the desktop breakpoint — it is
 * capped and square, so it fits beside 22rem of stats there (scope
 * decision `20260925-095734`); the stats hold at 22rem until xl.
 * The List's rows want the width, so it waits for xl. The Ring's
 * track stops at 52rem (its 48rem ring and the panel around it);
 * width past the caps becomes even gutters.
 */
export function editorGridClass(addMode: AddMode, view: FittingView, addOpen: boolean): string {
  const tracks =
    addMode === 'docked'
      ? view === 'ring'
        ? 'grid-cols-[20rem_minmax(0,52rem)_minmax(22rem,26rem)]'
        : 'grid-cols-[20rem_minmax(0,1fr)_minmax(22rem,26rem)]'
      : addOpen
        ? 'grid-cols-1'
        : view === 'ring'
          ? 'grid-cols-1 lg:grid-cols-[minmax(0,52rem)_22rem] xl:grid-cols-[minmax(0,52rem)_minmax(22rem,28rem)]'
          : 'grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]';
  return `grid items-start justify-center gap-3 ${tracks}`;
}

/**
 * The Ring stays in view while the tall stats column is read (lg+). The List
 * needs the width and the stacked layout has nothing beside it. At its max
 * height the column also clears the page's bottom padding, so at the page's
 * end, where it rests on the grid's bottom, its top is still on screen. The
 * Ring sizes itself to that max height (`--ring-room`).
 */
export function editorColumnClass(view: FittingView, addMode: AddMode, addOpen: boolean): string {
  const sticky =
    view === 'ring' && (addMode === 'docked' || !addOpen)
      ? 'lg:sticky lg:top-3 lg:max-h-(--ring-room) lg:overflow-y-auto lg:[--ring-room:calc(100vh-2.5rem)]'
      : '';
  return `min-w-0 space-y-3 ${sticky}`;
}
