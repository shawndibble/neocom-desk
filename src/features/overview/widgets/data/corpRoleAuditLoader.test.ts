import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveCorpReadAccess = vi.fn();
const loadRoleAudit = vi.fn();
vi.mock('@/features/corp/corpReadAccess', () => ({
  resolveCorpReadAccess: (...a: unknown[]) => resolveCorpReadAccess(...a),
}));
vi.mock('@/features/corp/roleAudit', () => ({
  loadRoleAudit: (...a: unknown[]) => loadRoleAudit(...a),
}));

import { loadCorpRoleAudit } from './corpFeedLoaders';

const access = (can: boolean) => ({ corporationId: 98000001, can: () => can });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadCorpRoleAudit', () => {
  it('reads without titles and returns the audit', async () => {
    resolveCorpReadAccess.mockResolvedValue(access(true));
    const data = { holders: [], changes: [], fetchedAt: new Date(0), fromCache: true };
    loadRoleAudit.mockResolvedValue({ data });
    const feed = await loadCorpRoleAudit(1);
    expect(loadRoleAudit).toHaveBeenCalledWith(1, 98000001, { withTitles: false });
    expect(feed).toMatchObject({ readable: true, fromCache: true, audit: data });
  });

  it('asks for a grant when it lapsed', async () => {
    resolveCorpReadAccess.mockResolvedValue(access(true));
    loadRoleAudit.mockResolvedValue({ needsReauth: true });
    expect(await loadCorpRoleAudit(1)).toMatchObject({ readable: false, needsReauth: true });
  });
});
