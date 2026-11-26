import type { CharacterContact } from '@/esi/endpoints';

export type StandingSource = CharacterContact['contact_type'];

export const STANDING_PRECEDENCE: readonly StandingSource[] = [
  'character',
  'corporation',
  'alliance',
  'faction',
];

export interface StandingTarget {
  characterId?: number;
  corporationId?: number;
  allianceId?: number;
  factionId?: number;
}

export interface EffectiveStanding {
  standing: number;
  source: StandingSource;
  sourceId: number;
  inherited: boolean;
  contact: CharacterContact;
}

export type ContactStandingIndex = ReadonlyMap<string, CharacterContact>;

function indexKey(contactType: StandingSource, contactId: number): string {
  return `${contactType}:${contactId}`;
}

export function buildContactStandingIndex(
  contacts: readonly CharacterContact[]
): ContactStandingIndex {
  const index = new Map<string, CharacterContact>();
  for (const contact of contacts) {
    const key = indexKey(contact.contact_type, contact.contact_id);
    if (!index.has(key)) index.set(key, contact);
  }
  return index;
}

const TARGET_ID_BY_SOURCE: Record<StandingSource, keyof StandingTarget> = {
  character: 'characterId',
  corporation: 'corporationId',
  alliance: 'allianceId',
  faction: 'factionId',
};

export function effectiveStanding(
  index: ContactStandingIndex,
  target: StandingTarget
): EffectiveStanding | null {
  for (const source of STANDING_PRECEDENCE) {
    const id = target[TARGET_ID_BY_SOURCE[source]];
    if (id === undefined) continue;
    const contact = index.get(indexKey(source, id));
    if (!contact) continue;
    return {
      standing: contact.standing,
      source,
      sourceId: id,
      inherited: source !== 'character',
      contact,
    };
  }
  return null;
}
