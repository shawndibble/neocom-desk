import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadWorkbenchFits,
  parseWorkbenchHull,
  resetWorkbenchFitsCache,
  workbenchFitsUrl,
  type WorkbenchFit,
} from './workbenchFits';

function fit(id: string, dateAdded: number): WorkbenchFit {
  return { id, name: id, authorId: 1, authorName: 'Pilot', dateAdded, eft: `[Vexor, ${id}]` };
}

const fetchMock = vi.fn();

function serve(objects: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string) =>
    url in objects
      ? new Response(JSON.stringify(objects[url]), { status: 200 })
      : new Response('missing', { status: 404 })
  );
}

beforeEach(() => {
  resetWorkbenchFitsCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseWorkbenchHull', () => {
  it('reads the hull object newest first, one per id, skipping malformed rows', () => {
    const fits = parseWorkbenchHull({
      shipTypeId: 626,
      fits: [
        fit('b', 2),
        fit('a', 1),
        fit('c', 3),
        fit('a', 1),
        { id: 'x' },
        { id: 'y', eft: '[Vexor, y]' },
        null,
      ],
    });
    expect(fits.map((f) => f.id)).toEqual(['c', 'b', 'a']);
  });

  it('is empty for anything not shaped like a hull object', () => {
    expect(parseWorkbenchHull(null)).toEqual([]);
    expect(parseWorkbenchHull({ fits: 'nope' })).toEqual([]);
  });
});

describe('loadWorkbenchFits', () => {
  it('fetches the one R2 object for the hull by id, and caches the answer', async () => {
    expect(workbenchFitsUrl(626)).toBe('https://data.neocomdesk.com/workbench-fits/626.json');
    serve({ [workbenchFitsUrl(626)]: { shipTypeId: 626, fits: [fit('a', 1), fit('c', 3)] } });
    const result = await loadWorkbenchFits(626, 1_000);
    expect(result).toEqual({ ok: true, fits: [fit('c', 3), fit('a', 1)] });
    await loadWorkbenchFits(626, 2_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(workbenchFitsUrl(626));
  });

  it('a hull with no object yet is ok with no fits', async () => {
    serve({});
    expect(await loadWorkbenchFits(626)).toEqual({ ok: true, fits: [] });
  });

  it('a failed read is not ok, and is not cached', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await loadWorkbenchFits(627)).toEqual({ ok: false });
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    expect(await loadWorkbenchFits(627)).toEqual({ ok: false });
    serve({ [workbenchFitsUrl(627)]: { fits: [fit('a', 1)] } });
    expect(await loadWorkbenchFits(627)).toEqual({ ok: true, fits: [fit('a', 1)] });
  });
});
