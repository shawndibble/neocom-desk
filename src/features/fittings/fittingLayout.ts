import type { FittingView } from './fittingViewPreference';

export const THREE_COLUMN_QUERY = '(min-width: 87.5rem)';

export type AddMode = 'docked' | 'slideOut' | 'sheet';

export function addModeFor(threeColumns: boolean, isDesktop: boolean): AddMode {
  return threeColumns ? 'docked' : isDesktop ? 'slideOut' : 'sheet';
}

export function leftColumn(
  addMode: AddMode,
  addOpen: boolean,
  improveDocked: boolean
): { addMode: AddMode; addOpen: boolean; pushed: boolean; statsFirst: boolean } {
  if (improveDocked && addMode !== 'sheet') {
    return {
      addMode: 'slideOut',
      addOpen: false,
      pushed: false,
      statsFirst: addMode === 'slideOut',
    };
  }
  return { addMode, addOpen, pushed: addOpen && addMode === 'slideOut', statsFirst: false };
}

export function editorGridClass(
  addMode: AddMode,
  view: FittingView,
  addOpen: boolean,
  improveOpen = false
): string {
  const tracks =
    addMode === 'docked'
      ? view === 'ring'
        ? 'grid-cols-[20rem_minmax(0,52rem)_22rem]'
        : 'grid-cols-[20rem_minmax(0,1fr)_22rem]'
      : addOpen
        ? 'grid-cols-1'
        : view === 'ring'
          ? 'grid-cols-1 lg:grid-cols-[minmax(0,52rem)_22rem]'
          : 'grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem]';
  return `grid items-start ${improveOpen ? 'justify-start' : 'justify-center'} gap-3 ${tracks}`;
}

export function editorColumnClass(view: FittingView, addMode: AddMode, addOpen: boolean): string {
  const sticky =
    view === 'ring' && (addMode === 'docked' || !addOpen)
      ? 'lg:sticky lg:top-3 lg:max-h-(--ring-room) lg:overflow-y-auto lg:[--ring-room:calc(100vh-2.5rem)]'
      : '';
  return `min-w-0 space-y-3 ${sticky}`;
}
