import { describe, expect, it, vi } from 'vitest';
import { walkCursorPages } from './cursorPages';

describe('walkCursorPages', () => {
  it('follows each page’s after cursor until an empty page', async () => {
    const pages: Record<string, { cursor?: { after?: string }; items: number[] }> = {
      start: { cursor: { after: 'p2' }, items: [1, 2] },
      p2: { cursor: { after: 'p3' }, items: [3] },
      p3: { cursor: { after: 'p4' }, items: [] },
    };
    const read = vi.fn(async (after: string | undefined) => pages[after ?? 'start']!);
    await expect(walkCursorPages(read)).resolves.toEqual([1, 2, 3]);
    expect(read.mock.calls.map(([after]) => after)).toEqual([undefined, 'p2', 'p3']);
  });

  it('stops when a page carries no after cursor', async () => {
    const read = vi.fn(async () => ({ items: [1] }));
    await expect(walkCursorPages(read)).resolves.toEqual([1]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('throws on a cursor that does not move, and past the page cap, never returning a short list', async () => {
    const stuck = vi.fn(async () => ({ cursor: { after: 'same' }, items: [1] }));
    await expect(walkCursorPages(stuck)).rejects.toThrow(/did not move/);
    let n = 0;
    const endless = vi.fn(async () => ({ cursor: { after: String((n += 1)) }, items: [n] }));
    await expect(walkCursorPages(endless, 3)).rejects.toThrow(/3 pages/);
    expect(endless).toHaveBeenCalledTimes(3);
  });

  it('throws when a page fails, so no half list is kept', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ cursor: { after: 'p2' }, items: [1] })
      .mockRejectedValueOnce(new Error('503'));
    await expect(walkCursorPages(read)).rejects.toThrow('503');
  });
});
