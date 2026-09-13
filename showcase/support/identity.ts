/**
 * The showcase pilot. Deliberately not e2e's "Test Pilot" / flat 20s — these
 * numbers and names are the ones that end up in marketing PNGs.
 */
import { SCOPES as BASE_SCOPES, scopesForGroup } from '../../src/esi/scopes';

/**
 * Every scope, base grant plus both opt-in groups. `scopesForGroup('corp')`
 * is what unlocks the corp tools at all: `useCorpAccess` gates on the granted
 * scope list *and* the cached roles independently, and renders nothing when
 * either is short.
 */
export const SCOPES: readonly string[] = [
  ...new Set([...BASE_SCOPES, ...scopesForGroup('corp'), ...scopesForGroup('structureMarkets')]),
];

export const CHARACTER_ID = 2117414873;
export const CHARACTER_NAME = 'Kaeda Vynn';
export const OWNER_HASH = 'SHOWCASEOWNERHASH';

export const CORPORATION_ID = 98615046;
export const CORPORATION_NAME = 'Vespera Industrial Combine';
export const CORPORATION_TICKER = 'VSPRA';
export const ALLIANCE_ID = 99010452;
export const ALLIANCE_NAME = 'Meridian Compact';

/** Far-future expiry (epoch ms) so no refresh grant is ever attempted. */
export const TOKEN_EXPIRES_AT = Date.parse('2100-01-01T00:00:00Z');
