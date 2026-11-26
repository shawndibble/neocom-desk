import { DESKTOP_SIZE, PHONE_SIZE, type Screenshot } from './screenshots';

export interface Tile {
  key: string;
  shot: Screenshot;
  span: string;
  wide?: boolean;
}

export const QUESTION_TILES: Tile[] = [
  {
    key: 'marketRange',
    shot: { file: 'desktop-market', key: 'market', size: DESKTOP_SIZE },
    span: 'md:col-span-2 lg:col-span-4',
    wide: true,
  },
  {
    key: 'fitting',
    shot: { file: 'desktop-fitting', key: 'fitting', size: DESKTOP_SIZE },
    span: 'lg:col-span-2',
  },
  {
    key: 'assets',
    shot: { file: 'desktop-assets', key: 'assets', size: DESKTOP_SIZE },
    span: 'lg:col-span-2',
  },
  {
    key: 'orders',
    shot: { file: 'desktop-order-detail', key: 'orderDetail', size: DESKTOP_SIZE },
    span: 'md:col-span-2 lg:col-span-4',
    wide: true,
  },
  {
    key: 'courier',
    shot: { file: 'desktop-courier', key: 'courier', size: DESKTOP_SIZE },
    span: 'lg:col-span-3',
  },
  {
    key: 'build',
    shot: { file: 'desktop-build-plan', key: 'buildPlan', size: DESKTOP_SIZE },
    span: 'lg:col-span-3',
  },
];

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
