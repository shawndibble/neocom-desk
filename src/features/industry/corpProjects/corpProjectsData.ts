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
import { EsiError } from '@/esi/errors';
import { loadCorpWithCacheStatus } from '@/features/corp/corpRead';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

export interface ProjectReads {
  listPage: (after: string | undefined) => Promise<{
    cursor?: { after?: string };
    projects: { id: string }[];
  } | null>;
  detail: (projectId: string) => Promise<ProjectDetailInput | null>;
  contribution: (projectId: string) => Promise<{ contributed: number } | null>;
}

const MAX_PAGES = 10;

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
    if (next === undefined || next === after) break;
    after = next;
  }

  const found = new Map<string, CorpManufactureProject>();
  let transient = false;
  await mapWithConcurrencyLimit(ids, ESI_FANOUT_CONCURRENCY, async (id) => {
    try {
      const detail = await reads.detail(id);
      if (!detail) return;
      if (toManufactureProject(detail, 0) === null) return;
      const contribution = await reads.contribution(id);
      if (!contribution) return;
      const project = toManufactureProject(detail, contribution.contributed);
      if (project) found.set(id, project);
    } catch (error) {
      if (
        error instanceof EsiError &&
        (error.status === 0 || error.status === 429 || error.status >= 500)
      ) {
        transient = true;
      }
    }
  });
  if (transient) return null;
  return ids.flatMap((id) => {
    const project = found.get(id);
    return project ? [project] : [];
  });
}

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
