import type { WarParty } from '@/engine/wars';

/** The one id that names a war party: ESI gives a party an alliance or a corporation, not both. */
export function partyEntity(
  party: Pick<WarParty, 'corporationId' | 'allianceId'>
): { kind: 'alliance' | 'corporation'; id: number } | null {
  if (party.allianceId !== undefined) return { kind: 'alliance', id: party.allianceId };
  if (party.corporationId !== undefined) return { kind: 'corporation', id: party.corporationId };
  return null;
}
