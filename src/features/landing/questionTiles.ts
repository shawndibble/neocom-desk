import { DESKTOP_SIZE, PHONE_SIZE, type Screenshot } from './screenshots';

/**
 * One cell of the grid: the `login.answers.<key>` copy and the capture that
 * answers it. `span` is a literal Tailwind class (never built from a number,
 * which the compiler would not see); the six-column grid is arranged so every
 * row sums to six on lg and to two on md. `wide` lays the cell out text-left,
 * image-right on lg.
 */
export interface Tile {
  key: string;
  shot: Screenshot;
  span: string;
  wide?: boolean;
}

export const QUESTION_TILES: Tile[] = [
  {
    key: 'orders',
    shot: { file: 'desktop-order-detail', key: 'orderDetail', size: DESKTOP_SIZE },
    span: 'md:col-span-2 lg:col-span-4',
    wide: true,
  },
  {
    key: 'journal',
    shot: { file: 'desktop-wallet-journal', key: 'walletJournal', size: DESKTOP_SIZE },
    span: 'lg:col-span-2',
  },
  {
    key: 'build',
    shot: { file: 'desktop-build-plan', key: 'buildPlan', size: DESKTOP_SIZE },
    span: 'lg:col-span-3',
  },
  {
    key: 'fitting',
    shot: { file: 'desktop-fitting', key: 'fitting', size: DESKTOP_SIZE },
    span: 'lg:col-span-3',
  },
  {
    key: 'flyNext',
    shot: { file: 'desktop-ship-tree', key: 'shipTree', size: DESKTOP_SIZE },
    span: 'lg:col-span-2',
  },
  {
    key: 'survey',
    shot: { file: 'desktop-survey', key: 'survey', size: DESKTOP_SIZE },
    span: 'md:col-span-2 lg:col-span-4',
    wide: true,
  },
  {
    key: 'courier',
    shot: { file: 'desktop-courier', key: 'courier', size: DESKTOP_SIZE },
    span: 'lg:col-span-3',
  },
  {
    key: 'assets',
    shot: { file: 'desktop-assets', key: 'assets', size: DESKTOP_SIZE },
    span: 'lg:col-span-3',
  },
];

/** The phone band: three tall captures, staggered beside their questions. */
export const PHONE_TILES: Tile[] = [
  {
    key: 'marketJumps',
    shot: { file: 'phone-market-jumps', key: 'phoneMarketJumps', size: PHONE_SIZE },
    span: '',
  },
  {
    key: 'routeSafety',
    shot: { file: 'phone-route-safety', key: 'phoneRouteSafety', size: PHONE_SIZE },
    span: '',
  },
  {
    key: 'pilot',
    shot: { file: 'phone-pilot-lookup', key: 'phonePilotLookup', size: PHONE_SIZE },
    span: '',
  },
];
