import { describe, expect, it } from 'vitest';
import type { PayeeRecord } from '@/db';
import { groupPayees, payeeDuplicateAliases, payeeSettingsKey } from './payeeGroups';

function payee(id: string, characterId: number, extra: Partial<PayeeRecord> = {}): PayeeRecord {
  return { id, characterId, name: 'BUH', defaultTaxPct: 10, updatedAt: 1, ...extra };
}

const corp = { entityId: 98000001, entityKind: 'corporation' } as const;

describe('groupPayees', () => {
  it('merges verified Payees of one entity and kind, whatever the name or character', () => {
    const groups = groupPayees([
      payee('b', 2, { ...corp, name: 'Bureau of Unified Harvesting' }),
      payee('a', 1, { ...corp, name: 'BUH' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].primary.id).toBe('a');
    expect(groups[0].members.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('keeps a character and a corporation with the same id apart', () => {
    const groups = groupPayees([
      payee('a', 1, corp),
      payee('b', 1, { entityId: 98000001, entityKind: 'character' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('merges unverified Payees on an identical name, ignoring case and spacing', () => {
    const groups = groupPayees([
      payee('a', 1, { name: 'Old Landlord' }),
      payee('b', 2, { name: ' old landlord ' }),
      payee('c', 2, { name: 'Other' }),
    ]);
    expect(groups.map((g) => g.members.length).sort()).toEqual([1, 2]);
  });

  it('never merges an unverified Payee into a verified one of the same name', () => {
    expect(groupPayees([payee('a', 1, corp), payee('b', 2)])).toHaveLength(2);
  });

  it('merges a Payee linked without a kind only with the same id and no kind', () => {
    const groups = groupPayees([
      payee('a', 1, { entityId: 5 }),
      payee('b', 2, { entityId: 5 }),
      payee('c', 3, { entityId: 5, entityKind: 'corporation' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('sorts groups by primary name', () => {
    const groups = groupPayees([payee('a', 1, { name: 'Zed' }), payee('b', 1, { name: 'Abe' })]);
    expect(groups.map((g) => g.primary.name)).toEqual(['Abe', 'Zed']);
  });

  it('flags a group whose members bill differently, and lists each distinct setting', () => {
    const [same] = groupPayees([payee('a', 1, corp), payee('b', 2, corp)]);
    expect(same.variants).toHaveLength(1);
    const [differ] = groupPayees([
      payee('a', 1, corp),
      payee('b', 2, { ...corp, defaultTaxPct: 7 }),
      payee('c', 3, { ...corp, defaultTaxPct: 7, hubId: 'amarr' }),
    ]);
    expect(differ.variants.map((v) => v.members.map((p) => p.id))).toEqual([['a'], ['b'], ['c']]);
  });
});

describe('payeeDuplicateAliases', () => {
  it('maps every non-primary member to its primary', () => {
    const aliases = payeeDuplicateAliases(
      groupPayees([payee('a', 1, corp), payee('b', 2, corp), payee('c', 3, corp)])
    );
    expect([...aliases]).toEqual([
      ['b', 'a'],
      ['c', 'a'],
    ]);
  });
});

describe('payeeSettingsKey', () => {
  it('ignores Default Systems, which stay per character', () => {
    const withSystems = payee('a', 1, { defaultSystems: [{ systemId: 1, from: '2026-01-01' }] });
    expect(payeeSettingsKey(withSystems)).toBe(payeeSettingsKey(payee('b', 2)));
  });
});
