import { describe, expect, it } from 'vitest';
import { publishCourierContractsToR2, REFRESH_AFTER_MS, type R2Put } from './r2Publisher.js';
import type { PublicCourierContractRow } from './publicContracts.js';

const row = (contractId: number) => ({ contractId }) as unknown as PublicCourierContractRow;
const INDEX_KEY = 'courier-contracts/index.json';

function recorder(failOn?: (key: string) => boolean) {
  const puts: { key: string; headers: Record<string, string> }[] = [];
  const put: R2Put = async (key, _body, headers) => {
    if (failOn?.(key)) throw new Error('boom');
    puts.push({ key, headers });
  };
  return { puts, put };
}

const publish = (
  over: Partial<Parameters<typeof publishCourierContractsToR2>[0]> & { put: R2Put }
) =>
  publishCourierContractsToR2({
    rows: [row(1)],
    lastSyncedAt: 1,
    previous: null,
    now: 1000,
    ...over,
  });

describe('publishCourierContractsToR2', () => {
  it('uploads the object then index.json last, with the right headers', async () => {
    const { puts, put } = recorder();
    const result = await publish({ put });
    expect(puts.map((p) => p.key)).toEqual([
      expect.stringMatching(/^courier-contracts\/rows\.[0-9a-f]{16}\.json$/),
      INDEX_KEY,
    ]);
    expect(puts[0].headers).toMatchObject({
      'Content-Encoding': 'gzip',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    expect(puts[1].headers['Cache-Control']).toBe('public, max-age=60');
    expect(result).toMatchObject({ uploaded: true, indexWritten: true });
  });

  it('uploads only index.json when the rows are unchanged', async () => {
    const first = await publish({ put: recorder().put });
    const { puts, put } = recorder();
    await publish({ put, previous: first.state, now: 2000, lastSyncedAt: 2 });
    expect(puts.map((p) => p.key)).toEqual([INDEX_KEY]);
  });

  it('uploads the new object when a row changes', async () => {
    const first = await publish({ put: recorder().put });
    const { puts, put } = recorder();
    await publish({ put, rows: [row(2)], previous: first.state, now: 2000 });
    expect(puts).toHaveLength(2);
  });

  it('re-uploads once the refresh interval passes, so a lifecycle rule cannot expire it', async () => {
    const first = await publish({ put: recorder().put });
    const { puts, put } = recorder();
    await publish({ put, previous: first.state, now: 1000 + REFRESH_AFTER_MS });
    expect(puts).toHaveLength(2);
  });

  it('skips index.json and keeps the old state when the upload fails', async () => {
    const first = await publish({ put: recorder().put });
    const { puts, put } = recorder(() => true);
    const result = await publish({ put, rows: [row(2)], previous: first.state, now: 2000 });
    expect(puts).toHaveLength(0);
    expect(result).toMatchObject({
      uploaded: false,
      indexWritten: false,
      firstError: 'Error: boom',
    });
    expect(result.state).toEqual(first.state);
  });

  it('reports a failed index write without throwing, and records the upload', async () => {
    const { put } = recorder((key) => key === INDEX_KEY);
    const result = await publish({ put });
    expect(result).toMatchObject({ uploaded: true, indexWritten: false });
    expect(result.state.hash).not.toBeNull();
  });
});
