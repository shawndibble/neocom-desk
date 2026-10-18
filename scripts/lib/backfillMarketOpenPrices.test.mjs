import { describe, expect, it, vi } from 'vitest';
import { OpenPriceFold } from '../../functions/src/marketOpenPrices.ts';
import { parseArgs, runBackfill } from './backfillMarketOpenPrices.mjs';

describe('parseArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseArgs(['--from', '2026-10-01', '--to', '2026-10-03'])).toMatchObject({
      write: false,
      chunkDays: 30,
    });
  });
  it('--write needs a project', () => {
    expect(() => parseArgs(['--from', '2026-10-01', '--to', '2026-10-03', '--write'])).toThrow(
      /--project/
    );
    expect(
      parseArgs(['--from', '2026-10-01', '--to', '2026-10-03', '--write', '--project', 'p'])
    ).toMatchObject({ write: true, project: 'p' });
  });
  it('rejects bad dates, order, flags and chunk sizes', () => {
    expect(() => parseArgs(['--to', '2026-10-03'])).toThrow(/YYYY-MM-DD/);
    expect(() => parseArgs(['--from', '2026-10-04', '--to', '2026-10-03'])).toThrow(/after/);
    expect(() => parseArgs(['--from', '2026-10-01', '--to', '2026-10-03', '--x'])).toThrow(
      /unknown/
    );
    expect(() =>
      parseArgs(['--from', '2026-10-01', '--to', '2026-10-03', '--chunk-days', '0'])
    ).toThrow();
  });
});

// A fold that passes the plausibility guard: every tracked region with a few types.
function plausible(price) {
  const fold = new OpenPriceFold();
  for (const region of [10000002, 10000043, 10000032, 10000030, 10000042]) {
    for (let t = 1; t <= 2000; t++) fold.add(region, t, true, price);
  }
  return fold;
}

function deps(over = {}) {
  return {
    from: '2026-10-01',
    to: '2026-10-04',
    chunkDays: 2,
    write: true,
    snapshotUrlFor: async (d) => `https://x/${d}`,
    foldUrl: async (url, fold) => {
      const price = Number(url.slice(-2));
      for (const e of plausible(price).entries()) fold.add(e.regionId, e.typeId, true, e.buy);
      return 10;
    },
    writeGroups: vi.fn(async (groups) => groups.length),
    log: vi.fn(),
    ...over,
  };
}

describe('runBackfill', () => {
  it('writes in ascending chunks and reports where to resume', async () => {
    const d = deps();
    const result = await runBackfill(d);
    expect(d.writeGroups).toHaveBeenCalledTimes(2);
    const firstChunk = d.writeGroups.mock.calls[0][0][0];
    expect(firstChunk.days.map((x) => x.date)).toEqual(['2026-10-01', '2026-10-02']);
    expect(result).toEqual({ lastWritten: '2026-10-04', skipped: [] });
  });
  it('dry run never writes', async () => {
    const d = deps({ write: false });
    const result = await runBackfill(d);
    expect(d.writeGroups).not.toHaveBeenCalled();
    expect(result.lastWritten).toBeNull();
  });
  it('skips missing and implausible days without writing them', async () => {
    const d = deps({
      snapshotUrlFor: async (date) => (date === '2026-10-02' ? null : `https://x/${date}`),
      foldUrl: async (url, fold) => {
        if (url.endsWith('03')) return 0; // empty download; the rest are thin
        fold.add(10000002, 1, true, 1);
        return 1;
      },
    });
    const result = await runBackfill(d);
    expect(result.skipped).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(d.writeGroups).not.toHaveBeenCalled();
  });
  it('stops at a failed write so lastWritten still names the resume point', async () => {
    let calls = 0;
    const d = deps({
      writeGroups: async (g) => {
        if (++calls === 2) throw new Error('boom');
        return g.length;
      },
    });
    await expect(runBackfill(d)).rejects.toThrow('boom');
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining('resume with --from 2026-10-03'));
  });
});
