import { beforeEach, describe, expect, it, vi } from 'vitest';

const roles = vi.fn();
const history = vi.fn();
const titles = vi.fn();
const memberTitles = vi.fn();
vi.mock('./members', () => ({
  loadCorporationCeoId: async () => 1,
  loadCorporationMemberRoles: (...a: unknown[]) => roles(...a),
  toMemberRoles: (rows: { character_id: number; roles?: string[] }[]) =>
    new Map(rows.map((r) => [r.character_id, r.roles ?? []])),
}));
vi.mock('@/esi/cache', () => ({
  conditionalFetch: (fn: unknown) => ({ fetchLive: fn, conditional: fn }),
  conditionalPagedFetch: (fn: unknown) => ({ fetchLive: fn, conditional: fn }),
}));
vi.mock('./corpRead', () => ({
  CorpReadFailed: class extends Error {},
  loadCorpPaginatedWithCacheStatus: (...a: unknown[]) => history(...a),
  loadCorpWithCacheStatus: (_c: number, _o: number, key: string) =>
    key === 'titles' ? titles() : memberTitles(),
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: async (ids: number[]) => new Map(ids.map((id) => [id, `n${id}`])),
}));

import { loadRoleAudit, toMemberTitleNames } from './roleAudit';

const ok = <T>(data: T) => ({
  cached: { data, fetchedAt: new Date(1000), fromCache: false },
  needsReauth: false,
});
const none = { cached: null, needsReauth: false };

beforeEach(() => {
  vi.clearAllMocks();
  roles.mockResolvedValue(
    ok([
      { character_id: 1, roles: ['Director', 'Auditor'] },
      { character_id: 2, roles: ['Auditor'] },
      { character_id: 3 },
    ])
  );
  history.mockResolvedValue(
    ok([
      {
        changed_at: '2026-10-19T00:00:00Z',
        character_id: 1,
        issuer_id: 9,
        role_type: 'roles',
        old_roles: [],
        new_roles: ['Director'],
      },
    ])
  );
  titles.mockResolvedValue(ok([{ title_id: 1, name: 'CEO' }, { title_id: 2 }]));
  memberTitles.mockResolvedValue(ok([{ character_id: 1, titles: [1, 2] }]));
});

describe('loadRoleAudit', () => {
  it('keeps only members with a sensitive role, with titles when asked', async () => {
    const result = await loadRoleAudit(7, 98, { withTitles: true });
    if (!('data' in result)) throw new Error('expected data');
    expect(result.data.holders).toEqual([{ characterId: 1, roles: ['Director'], titles: ['CEO'] }]);
    expect(result.data.ceoId).toBe(1);
    expect(result.data.titlesKnown).toBe(true);
    expect(result.data.changes).toHaveLength(1);
    expect(result.data.names.get(9)).toBe('n9');
  });

  it('reads no titles for the widget', async () => {
    const result = await loadRoleAudit(7, 98, { withTitles: false });
    if (!('data' in result)) throw new Error('expected data');
    expect(titles).not.toHaveBeenCalled();
    expect(result.data.titlesKnown).toBe(false);
  });

  it('degrades history to null, and asks for a grant or throws when roles fail', async () => {
    history.mockResolvedValue(none);
    const result = await loadRoleAudit(7, 98, { withTitles: false });
    expect('data' in result && result.data.changes).toBeNull();
    roles.mockResolvedValue({ cached: null, needsReauth: true });
    expect(await loadRoleAudit(7, 98, { withTitles: false })).toEqual({ needsReauth: true });
    roles.mockResolvedValue(none);
    await expect(loadRoleAudit(7, 98, { withTitles: false })).rejects.toThrow('member roles');
  });
});

describe('toMemberTitleNames', () => {
  it('drops unnamed titles', () => {
    const map = toMemberTitleNames(
      [{ title_id: 1, name: ' CEO ' }, { title_id: 2 }],
      [{ character_id: 1, titles: [1, 2, 3] }]
    );
    expect(map.get(1)).toEqual(['CEO']);
  });
});
