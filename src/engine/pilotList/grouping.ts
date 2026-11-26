import { securityBand } from '@/engine/securityStatus';
import type { KillSpace, KillSummary } from './killActivity';
import type { ContactStanding } from './standing';

export type PilotGroupId = 'marked' | 'here' | 'elsewhere' | 'quiet' | 'pending' | 'friendly';

export const PILOT_GROUP_ORDER: readonly PilotGroupId[] = [
  'marked',
  'here',
  'elsewhere',
  'quiet',
  'pending',
  'friendly',
];

export interface GroupableRow {
  standing: ContactStanding | null;
  ownOrganization: 'corporation' | 'alliance' | null;
  activity: KillSummary | null;
}

export function isFriendly(row: Pick<GroupableRow, 'standing' | 'ownOrganization'>): boolean {
  return row.ownOrganization !== null || row.standing?.band === 'blue';
}

export function groupOf(row: GroupableRow, here: KillSpace | null): PilotGroupId {
  if (isFriendly(row)) return 'friendly';
  const band = row.standing?.band;
  if (band === 'red' || band === 'orange') return 'marked';
  if (row.activity === null) return 'pending';
  if (row.activity.recentCount === 0) return 'quiet';
  if (here !== null && row.activity.bySpace[here].count > 0) return 'here';
  return 'elsewhere';
}

const WORMHOLE_ID_MIN = 31_000_000;
const WORMHOLE_ID_MAX = 31_999_999;

export function spaceOfSystem(system: { id: number; security: number } | null): KillSpace | null {
  if (system === null) return null;
  if (system.id >= WORMHOLE_ID_MIN && system.id <= WORMHOLE_ID_MAX) return 'wormhole';
  return securityBand(system.security);
}
