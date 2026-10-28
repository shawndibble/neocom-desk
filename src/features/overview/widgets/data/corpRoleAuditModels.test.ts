import { describe, expect, it } from 'vitest';
import type { RoleAuditData } from '@/features/corp/roleAudit';
import type { CorpRoleAuditFeed } from './corpFeeds';
import { corpRoleAudit } from './corpRoleAuditModels';
import type { BuildContext, Feeds } from './types';

const NOW = Date.parse('2026-10-20T00:00:00Z');
const DAY = 86_400_000;
const t = (key: string, options?: Record<string, unknown>) =>
  options && Object.keys(options).length ? `${key}${JSON.stringify(options)}` : key;
const ctx: BuildContext = {
  t,
  now: NOW,
  activeCharacterId: 1,
  scopeAll: false,
  notTrainingAlert: false,
  range: 30,
};

const audit = (over: Partial<RoleAuditData> = {}): RoleAuditData => ({
  holders: [
    { characterId: 3, roles: ['Accountant', 'Trader'], titles: [] },
    { characterId: 2, roles: ['Director'], titles: [] },
    { characterId: 1, roles: ['Director'], titles: [] },
  ],
  changes: [
    { characterId: 3, issuerId: 1, changedAtMs: NOW - 2 * DAY, granted: ['Trader'], removed: [] },
    {
      characterId: 2,
      issuerId: 1,
      changedAtMs: NOW - 20 * DAY,
      granted: ['Director'],
      removed: [],
    },
  ],
  titlesKnown: false,
  ceoId: null,
  names: new Map([
    [1, 'Aria'],
    [2, 'Bex'],
    [3, 'Cole'],
  ]),
  fetchedAt: new Date(0),
  fromCache: false,
  ...over,
});

function feeds(over: Partial<RoleAuditData> = {}, feed: Partial<CorpRoleAuditFeed> = {}): Feeds {
  return {
    corpRoleAudit: {
      loading: false,
      error: false,
      data: {
        readable: true,
        needsReauth: false,
        fetchedAt: new Date(0),
        fromCache: false,
        audit: audit(over),
        ...feed,
      },
    },
  };
}

describe('corpRoleAudit', () => {
  it('counts Directors and the last seven days of changes', () => {
    const view = corpRoleAudit(feeds(), ctx);
    expect(view.number.value).toBe('2');
    expect(view.number.secondary?.text).toBe(
      'overview.widgets.corpRoleAudit.changes{"count":1,"days":7}'
    );
    expect(view.to).toBe('/corp/members/roles');
  });

  it('lists Directors first, then by name, with the last change per member', () => {
    const rows = corpRoleAudit(feeds(), ctx).table!.rows;
    expect(rows.map((row) => row.cells[0])).toEqual(['Aria', 'Bex', 'Cole']);
    expect(rows[2]!.cells[1]).toBe('Accountant, Trader');
    expect(rows[0]!.cells[2]).toBe('—');
    expect(rows[2]!.cells[2]).toMatchObject({ tone: 'caution' });
    expect(rows[1]!.cells[2]).toMatchObject({ tone: undefined });
  });

  it('says so when history could not be read, rather than "no changes"', () => {
    const view = corpRoleAudit(feeds({ changes: null }), ctx);
    expect(view.number.secondary?.text).toBe('overview.widgets.corpRoleAudit.changesUnknown');
    expect(view.table!.footer).toBe('overview.widgets.corpRoleAudit.historyUnknown');
  });

  it('is empty with no holders and unreadable without the capability', () => {
    expect(corpRoleAudit(feeds({ holders: [] }), ctx).status.isEmpty).toBe(true);
    const view = corpRoleAudit(feeds({}, { readable: false, audit: null }), ctx);
    expect(view.status.isEmpty).toBe(true);
    expect(view.emptyMessage).toBe('overview.board.corpUnreadable');
  });

  it('asks for a grant when it lapsed', () => {
    const view = corpRoleAudit(feeds({}, { readable: false, audit: null, needsReauth: true }), ctx);
    expect(view.status.needsPermission).toBe(true);
  });
});

describe('corpRoleAudit row detail', () => {
  const K = 'overview.widgets.corpRoleAudit';
  const detailFor = (key: string) =>
    corpRoleAudit(feeds(), ctx).table!.rows.find((r) => r.key === key)!.detail!;

  it('names the person, their roles and who changed them last', () => {
    const detail = detailFor('3');
    expect(detail.title).toBe('Cole');
    expect(detail.facts.map((f) => f.label)).toEqual([
      `${K}.col.roles`,
      `${K}.col.change`,
      `${K}.fact.granted`,
      `${K}.fact.removed`,
      `${K}.fact.changedBy`,
    ]);
    expect(detail.facts.at(-1)!.value).toBe('Aria');
  });

  it('shows only the roles for a member with no recorded change', () => {
    const view = corpRoleAudit(feeds({ changes: [] }), ctx);
    const detail = view.table!.rows[0]!.detail!;
    expect(detail.facts).toHaveLength(2);
  });
});
