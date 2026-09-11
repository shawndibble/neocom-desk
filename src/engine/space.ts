/**
 * The four-way space classification BPC Search's Space filter/column uses
 * (issue #796) — distinct from `securityBand`'s `SecurityBand`, which
 * deliberately folds wormhole space into `nullsec` for its own two callers
 * (rig multiplier, POCO base rate) and must stay untouched.
 */
import { securityBand } from './securityStatus';

export type SpaceKind = 'highsec' | 'lowsec' | 'nullsec' | 'wormhole';

export const SPACE_KINDS: readonly SpaceKind[] = ['highsec', 'lowsec', 'nullsec', 'wormhole'];

/** EVE names every wormhole system `J` followed by exactly six digits — the SDE's `security_status` for these systems is not a reliable signal on its own. */
const WORMHOLE_SYSTEM_NAME = /^j\d{6}$/i;

export function isWormholeSystemName(name: string): boolean {
  return WORMHOLE_SYSTEM_NAME.test(name.trim());
}

/**
 * Wormhole space is detected by name, checked first: a wormhole's raw
 * security status is not what puts it in `nullsec` for rig/POCO purposes
 * elsewhere in the app, and this classification must not agree with that one
 * by accident.
 */
export function classifySpace(systemName: string, security: number): SpaceKind {
  return isWormholeSystemName(systemName) ? 'wormhole' : securityBand(security);
}
