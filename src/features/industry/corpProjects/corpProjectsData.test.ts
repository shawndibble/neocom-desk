import { describe, expect, it, vi } from 'vitest';
import type { ProjectDetailInput } from '@/engine/corpProjects/corpProjects';
import { EsiError } from '@/esi/errors';
import { fetchManufactureProjects, type ProjectReads } from './corpProjectsData';

const summary = (id: string) => ({
  id,
  name: id,
  state: 'Active',
  last_modified: '2026-10-23T00:00:00Z',
  progress: { current: 0, desired: 10 },
});

const manufacture = (id: string, typeId = 24702): ProjectDetailInput => ({
  ...summary(id),
  reward: { initial: 1000, remaining: 1000 },
  details: {},
  contribution: {
    participation_limit: 5,
    reward_per_contribution: 100,
    submission_limit: 5,
    submission_multiplier: 1,
  },
  configuration: { manufacture_item: { owner: 'Any', items: [{ type_id: typeId }] } },
});

const mining = (id: string): ProjectDetailInput => ({
  ...manufacture(id),
  configuration: { mine_material: { owner: 'Any' } },
});

function reads(over: Partial<ProjectReads> = {}): ProjectReads {
  return {
    listPage: vi.fn().mockResolvedValue({ projects: [] }),
    detail: vi.fn().mockResolvedValue(null),
    contribution: vi.fn().mockResolvedValue({ contributed: 0 }),
    ...over,
  };
}

describe('fetchManufactureProjects', () => {
  it('walks the cursor until a page has no `after`, then keeps only manufacture projects', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({ cursor: { after: 'c2' }, projects: [summary('a'), summary('b')] })
      .mockResolvedValueOnce({ projects: [summary('c')] });
    const details: Record<string, ProjectDetailInput> = {
      a: manufacture('a'),
      b: mining('b'),
      c: manufacture('c', 587),
    };
    const detail = vi.fn(async (id: string) => details[id] ?? null);
    const contribution = vi.fn().mockResolvedValue({ contributed: 2 });

    const projects = await fetchManufactureProjects(reads({ listPage, detail, contribution }));

    expect(listPage.mock.calls.map(([after]) => after)).toEqual([undefined, 'c2']);
    expect(projects?.map((p) => [p.id, p.typeId, p.contributed])).toEqual([
      ['a', 24702, 2],
      ['c', 587, 2],
    ]);
    // A project that is not manufacture never costs a contribution read.
    expect(contribution.mock.calls.map(([id]) => id).sort()).toEqual(['a', 'c']);
  });

  it('stops on a repeated cursor instead of looping', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValue({ cursor: { after: 'same' }, projects: [summary('a')] });
    const detail = vi.fn().mockResolvedValue(manufacture('a'));
    const projects = await fetchManufactureProjects(reads({ listPage, detail }));
    expect(listPage).toHaveBeenCalledTimes(2);
    expect(projects).toHaveLength(1);
  });

  it('drops a project whose detail or contribution cannot be read, and keeps the rest', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValue({ projects: [summary('a'), summary('b'), summary('c')] });
    const detail = vi.fn(async (id: string) => {
      if (id === 'a') throw new Error('boom');
      return manufacture(id);
    });
    const contribution = vi.fn(async (id: string) => {
      if (id === 'b') return null;
      return { contributed: 1 };
    });
    const projects = await fetchManufactureProjects(reads({ listPage, detail, contribution }));
    expect(projects?.map((p) => p.id)).toEqual(['c']);
  });

  it('answers null, so nothing short is cached, when a read fails for a passing reason', async () => {
    const listPage = vi.fn().mockResolvedValue({ projects: [summary('a'), summary('b')] });
    const detail = vi.fn(async (id: string) => {
      if (id === 'a') throw new EsiError(503, 'status 503');
      return manufacture(id);
    });
    expect(await fetchManufactureProjects(reads({ listPage, detail }))).toBeNull();
    detail.mockImplementation(async (id: string) => {
      if (id === 'a') throw new EsiError(429, 'status 429');
      return manufacture(id);
    });
    expect(await fetchManufactureProjects(reads({ listPage, detail }))).toBeNull();
  });

  it('leaves out a project that is gone for good (404) and keeps the rest', async () => {
    const listPage = vi.fn().mockResolvedValue({ projects: [summary('a'), summary('b')] });
    const detail = vi.fn(async (id: string) => {
      if (id === 'a') throw new EsiError(404, 'status 404');
      return manufacture(id);
    });
    const projects = await fetchManufactureProjects(reads({ listPage, detail }));
    expect(projects?.map((p) => p.id)).toEqual(['b']);
  });

  it('lets a failed first page through so the cache can fall back or ask to re-login', async () => {
    const listPage = vi.fn().mockRejectedValue(new Error('403'));
    await expect(fetchManufactureProjects(reads({ listPage }))).rejects.toThrow('403');
  });

  it('is empty, not null, for a corporation with no projects', async () => {
    expect(await fetchManufactureProjects(reads())).toEqual([]);
  });

  it('returns null when ESI sends no body for the first page', async () => {
    const listPage = vi.fn().mockResolvedValue(null);
    expect(await fetchManufactureProjects(reads({ listPage }))).toBeNull();
  });
});
