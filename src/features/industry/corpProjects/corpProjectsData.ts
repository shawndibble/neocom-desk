/**
 * Fetch + cache layer for a corporation's open manufacture projects as one
 * Character sees them (issue #4786). The list names no project type, so every
 * open project costs a detail read, and each manufacture one a contribution
 * read. That is one cache row per Character and corporation, read when
 * Opportunities opens and never polled: `corp-project` is a 600-token window
 * per 15 minutes, shared by all four of its routes.
 */
import type { StatusResult } from '@/esi/cache';
import {
  getCorporationProject,
  getCorporationProjectContribution,
  getCorporationProjects,
} from '@/esi/endpoints';
import {
  toManufactureProject,
  type CorpManufactureProject,
  type ProjectDetailInput,
} from '@/engine/corpProjects/corpProjects';
import { loadCorpWithCacheStatus } from '@/features/corp/corpRead';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

/** The three reads a walk needs; each answers null when ESI sends no body. */
export interface ProjectReads {
  /** One cursor page, newest first. `after` is the previous page's cursor; undefined starts. */
  listPage: (after: string | undefined) => Promise<{
    cursor?: { after?: string };
    projects: { id: string }[];
  } | null>;
  detail: (projectId: string) => Promise<ProjectDetailInput | null>;
  contribution: (projectId: string) => Promise<{ contributed: number } | null>;
}

/** A corporation with a thousand open projects has bigger problems; this only bounds a bad cursor. */
const MAX_PAGES = 10;

/**
 * Every open manufacture project, in list order. A failed first page throws,
 * so the cache falls back to its stored row or reports a re-login; a project
 * whose own reads fail is left out rather than guessed at.
 */
export async function fetchManufactureProjects(
  reads: ProjectReads
): Promise<CorpManufactureProject[] | null> {
  const ids: string[] = [];
  const seen = new Set<string>();
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await reads.listPage(after);
    if (result === null) {
      if (page === 0) return null;
      break;
    }
    for (const { id } of result.projects) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    const next = result.cursor?.after;
    // A cursor that does not move would re-read the same page until the cap.
    if (next === undefined || next === after) break;
    after = next;
  }

  const found = new Map<string, CorpManufactureProject>();
  await mapWithConcurrencyLimit(ids, ESI_FANOUT_CONCURRENCY, async (id) => {
    try {
      const detail = await reads.detail(id);
      if (!detail) return;
      // Probe the type before paying for the contribution read.
      if (toManufactureProject(detail, 0) === null) return;
      const contribution = await reads.contribution(id);
      if (!contribution) return;
      const project = toManufactureProject(detail, contribution.contributed);
      if (project) found.set(id, project);
    } catch {
      // One unreadable project must not hide the rest of the list.
    }
  });
  return ids.flatMap((id) => {
    const project = found.get(id);
    return project ? [project] : [];
  });
}

/** The Character's open manufacture projects of `corporationId`, cached under a corp-scoped key. */
export function loadCorpManufactureProjects(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorpManufactureProject[]>> {
  return loadCorpWithCacheStatus(characterId, corporationId, 'manufactureProjects', () =>
    fetchManufactureProjects({
      listPage: async (after) =>
        (await getCorporationProjects(characterId, corporationId, { after })).data,
      detail: async (id) =>
        (await getCorporationProject(characterId, corporationId, id))
          .data as ProjectDetailInput | null,
      contribution: async (id) =>
        (await getCorporationProjectContribution(characterId, corporationId, id)).data,
    })
  );
}
