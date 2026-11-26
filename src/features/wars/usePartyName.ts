import { useEntityName } from '@/features/character/useEntityName';
import type { WarParty } from '@/engine/wars';
import { partyEntity } from './partyEntity';

export function usePartyName(party: Pick<WarParty, 'corporationId' | 'allianceId'>): string {
  const entity = partyEntity(party);
  const name = useEntityName(entity?.id);
  if (entity === null) return '—';
  return name ?? `#${entity.id}`;
}
