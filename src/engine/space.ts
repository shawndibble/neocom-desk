import { securityBand } from './securityStatus';

export type SpaceKind = 'highsec' | 'lowsec' | 'nullsec' | 'wormhole';

export const SPACE_KINDS: readonly SpaceKind[] = ['highsec', 'lowsec', 'nullsec', 'wormhole'];

export function isSpaceKind(raw: unknown): raw is SpaceKind {
  return typeof raw === 'string' && (SPACE_KINDS as readonly string[]).includes(raw);
}

const WORMHOLE_SYSTEM_NAME = /^j\d{6}$/i;

export function isWormholeSystemName(name: string): boolean {
  return WORMHOLE_SYSTEM_NAME.test(name.trim());
}

export function classifySpace(systemName: string, security: number): SpaceKind {
  return isWormholeSystemName(systemName) ? 'wormhole' : securityBand(security);
}
