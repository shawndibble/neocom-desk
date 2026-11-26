import type { WarParty } from '@/engine/wars';

export function partyEntity(
  party: Pick<WarParty, 'corporationId' | 'allianceId'>
): { kind: 'alliance' | 'corporation'; id: number } | null {
  if (party.allianceId !== undefined) return { kind: 'alliance', id: party.allianceId };
  if (party.corporationId !== undefined) return { kind: 'corporation', id: party.corporationId };
  return null;
}
