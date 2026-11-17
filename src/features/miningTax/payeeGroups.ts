/**
 * One Payee per corporation or player (#6308). Payee records stay per Character (Editable Data,
 * synced per Character), so a pilot's alts that mine for one corporation each hold a record of it.
 * The All-characters views read them as one: records that are the same recipient form a group, and
 * everything that lists, filters, sums or offers Payees works on groups. Pure: no Dexie.
 */
import type { PayeeRecord } from '@/db';

export interface PayeeVariant {
  /** The members that bill with exactly these terms (tax %, Trade Hub). */
  members: PayeeRecord[];
}

export interface PayeeGroup {
  key: string;
  /** The member that stands for the group: the lowest id, so it never changes with the view. */
  primary: PayeeRecord;
  /** Every stored record of this recipient, primary first. */
  members: PayeeRecord[];
  /** Distinct terms among the members; more than one means the pilot has a choice to make. */
  variants: PayeeVariant[];
}

/**
 * Who a record is. A verified Payee is its EVE entity and kind. An unverified one (from before a
 * Payee had to be someone in EVE) is its name, so it never merges into a verified Payee.
 */
export function payeeGroupKey(p: PayeeRecord): string {
  if (p.entityId !== undefined) return `entity:${p.entityKind ?? ''}:${p.entityId}`;
  return `name:${p.name.trim().toLowerCase()}`;
}

/** What a Payee bills with, which a merged record may differ on. Default Systems stay per Character. */
export const payeeSettingsKey = (p: PayeeRecord): string => `${p.defaultTaxPct}|${p.hubId ?? ''}`;

export function groupPayees(payees: readonly PayeeRecord[]): PayeeGroup[] {
  const byKey = new Map<string, PayeeRecord[]>();
  for (const p of [...payees].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = payeeGroupKey(p);
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  return [...byKey.entries()]
    .map(([key, members]) => {
      const byTerms = new Map<string, PayeeRecord[]>();
      for (const m of members) {
        const k = payeeSettingsKey(m);
        byTerms.set(k, [...(byTerms.get(k) ?? []), m]);
      }
      return {
        key,
        primary: members[0],
        members,
        variants: [...byTerms.values()].map((m) => ({ members: m })),
      };
    })
    .sort((a, b) => a.primary.name.localeCompare(b.primary.name));
}

/** Each non-primary member's id mapped to its primary's: the shape `canonicalPayeeId` reads. */
export function payeeDuplicateAliases(groups: readonly PayeeGroup[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const g of groups) for (const m of g.members.slice(1)) aliases.set(m.id, g.primary.id);
  return aliases;
}
