/**
 * Which group of the Local list a pilot belongs in, from facts only: the
 * Character's own contacts, their own corporation and alliance, and where the
 * pilot has killed lately. Group names state a condition ("Killed in
 * highsec"), never a verdict (decision `20260912-172628`).
 */
import { securityBand } from '@/engine/securityStatus';
import type { KillSpace, KillSummary } from './killActivity';
import type { ContactStanding } from './standing';

/** In the order they are listed. */
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
  /** The active Character's own corporation or alliance, when the pilot is in it. */
  ownOrganization: 'corporation' | 'alliance' | null;
  /** Null until the pilot's kills have loaded. */
  activity: KillSummary | null;
}

/**
 * Order of the checks matters: being in your own organisation beats a contact
 * (a red contact on a corpmate is still a corpmate), a red or orange contact
 * beats what they have killed, and a blue contact is friendly.
 */
export function groupOf(row: GroupableRow, here: KillSpace | null): PilotGroupId {
  if (row.ownOrganization !== null) return 'friendly';
  const band = row.standing?.band;
  if (band === 'red' || band === 'orange') return 'marked';
  if (band === 'blue') return 'friendly';
  if (row.activity === null) return 'pending';
  if (row.activity.recentCount === 0) return 'quiet';
  if (here !== null && row.activity.bySpace[here].count > 0) return 'here';
  return 'elsewhere';
}

/** J-space system ids all sit in this range. */
const WORMHOLE_ID_MIN = 31_000_000;
const WORMHOLE_ID_MAX = 31_999_999;

/** The kind of space a system is, as zKillboard labels kills; null when no system is known. */
export function spaceOfSystem(system: { id: number; security: number } | null): KillSpace | null {
  if (system === null) return null;
  if (system.id >= WORMHOLE_ID_MIN && system.id <= WORMHOLE_ID_MAX) return 'wormhole';
  return securityBand(system.security);
}
