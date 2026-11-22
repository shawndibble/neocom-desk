import { describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({
  labels: { cached: null, needsReauth: false } as Record<string, unknown>,
  headers: { cached: null, needsReauth: false, hasMore: false } as Record<string, unknown>,
}));
vi.mock('@/features/character/mail', () => ({
  loadMailLabels: async () => mail.labels,
  loadMailHeaders: async () => mail.headers,
}));

const { loadMailBoard } = await import('./boardData');

describe('loadMailBoard', () => {
  it('rejects when neither read landed and the grant is fine, so the widget fails instead of "0 unread"', async () => {
    mail.labels = { cached: null, needsReauth: false };
    mail.headers = { cached: null, needsReauth: false, hasMore: false };
    await expect(loadMailBoard(1)).rejects.toThrow();
  });

  it('still answers a lapsed grant with nothing cached, so the sign-in prompt shows', async () => {
    mail.labels = { cached: null, needsReauth: true };
    mail.headers = { cached: null, needsReauth: true, hasMore: false };
    expect(await loadMailBoard(1)).toMatchObject({ needsReauth: true, fetchedAt: null });
  });
});
