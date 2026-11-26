import type { PayeeRecord } from '@/db';

export interface PayeeVariant {
  members: PayeeRecord[];
}

export interface PayeeGroup {
  key: string;
  primary: PayeeRecord;
  members: PayeeRecord[];
  variants: PayeeVariant[];
}

export function payeeGroupKey(p: PayeeRecord): string {
  if (p.entityId !== undefined) return `entity:${p.entityKind ?? ''}:${p.entityId}`;
  return `name:${p.name.trim().toLowerCase()}`;
}

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

export function payeeDuplicateAliases(groups: readonly PayeeGroup[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const g of groups) for (const m of g.members.slice(1)) aliases.set(m.id, g.primary.id);
  return aliases;
}
