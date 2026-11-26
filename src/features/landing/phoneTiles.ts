import { PHONE_SIZE, type Screenshot } from './screenshots';

export interface PhoneTile {
  key: string;
  shot: Screenshot;
}

export const PHONE_TILES: PhoneTile[] = [
  {
    key: 'marketJumps',
    shot: { file: 'phone-market-jumps', key: 'phoneMarketJumps', size: PHONE_SIZE },
  },
  {
    key: 'routeSafety',
    shot: { file: 'phone-route-safety', key: 'phoneRouteSafety', size: PHONE_SIZE },
  },
  {
    key: 'pilot',
    shot: { file: 'phone-pilot-lookup', key: 'phonePilotLookup', size: PHONE_SIZE },
  },
];
