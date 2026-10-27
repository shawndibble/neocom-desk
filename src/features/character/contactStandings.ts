/**
 * Resolving "what do I think of this entity" from a Character's own contact
 * list — the lookup every page other than Contacts needs, and the one Contacts
 * itself needs to show that a neutral-looking pilot is covered by a -10
 * alliance entry.
 *
 * Pure (docs/ARCHITECTURE.md): the caller supplies the contacts and the
 * target's affiliation, both of which it already has.
 *
 * **Scope.** This resolves *your own* contact entries only. A pilot's real
 * in-game effective standing also inherits their corporation's contact list,
 * which is `esi-corporations.read_contacts.v1` — a scope Neocom Desk does not
 * ask for. Surfaces must say "your entries", never "their standing to you".
 */
import type { CharacterContact } from '@/esi/endpoints';

export type StandingSource = CharacterContact['contact_type'];

/**
 * Which tier wins when an entity matches several entries, best-informed
 * first: a pilot you named personally outranks a blanket entry on their corp,
 * which outranks one on their alliance.
 *
 * An ordered list rather than an if-chain so the order is one edit away, and
 * so a test can assert on it. **Assumption**: this mirrors EVE's own
 * precedence. It is a game rule, not something this repo can verify.
 */
export const STANDING_PRECEDENCE: readonly StandingSource[] = [
  'character',
  'corporation',
  'alliance',
  'faction',
];

/** The ids of an entity at every tier a contact entry could match. */
export interface StandingTarget {
  characterId?: number;
  corporationId?: number;
  allianceId?: number;
  factionId?: number;
}

export interface EffectiveStanding {
  standing: number;
  /** Which tier supplied it — what a surface shows so the value is explicable. */
  source: StandingSource;
  /** The id of the matched entry, not of the target: a corp entry reports the corp. */
  sourceId: number;
  /** True when the standing came from something other than a personal entry. */
  inherited: boolean;
  /** The winning entry itself, for its `is_blocked` / `is_watched` flags. */
  contact: CharacterContact;
}

/**
 * Type *and* id: 0 is a valid standing and ids are only unique within a type,
 * so neither a bare id key nor a truthiness check would do.
 */
export type ContactStandingIndex = ReadonlyMap<string, CharacterContact>;

function indexKey(contactType: StandingSource, contactId: number): string {
  return `${contactType}:${contactId}`;
}

/** First entry wins: ESI should not repeat an id, and if it does, order is all there is to go on. */
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

/** The highest-precedence contact entry matching any tier of `target`, or null for a stranger. */
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
