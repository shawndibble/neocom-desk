import type {
  CorporationIndustryJob,
  CorporationMiningExtraction,
  CorporationStructure,
} from '@/esi/endpoints';
import type {
  BoardExtractionSource,
  BoardJobSource,
  BoardStructureSource,
} from '@/engine/corp/board';
import { parseInstant } from '@/engine/esiInstant';

export function structureName(structure: Pick<CorporationStructure, 'name' | 'structure_id'>) {
  return structure.name ?? `#${structure.structure_id}`;
}

export function structureStateLabel(state: string): string {
  return state.replace(/_/g, ' ');
}

export function toBoardStructures(
  structures: readonly CorporationStructure[]
): BoardStructureSource[] {
  return structures.map((structure) => ({
    structureId: structure.structure_id,
    name: structureName(structure),
    fuelExpiresMs: parseInstant(structure.fuel_expires),
    state: structure.state ?? null,
    stateTimerEndMs: parseInstant(structure.state_timer_end),
    unanchorsAtMs: parseInstant(structure.unanchors_at),
    systemId: structure.system_id,
    typeId: structure.type_id,
    services: (structure.services ?? []).map((service) => ({
      name: service.name,
      state: service.state,
    })),
  }));
}

export function toBoardExtractions(
  extractions: readonly CorporationMiningExtraction[],
  structureNames: ReadonlyMap<number, string>
): BoardExtractionSource[] {
  const sources: BoardExtractionSource[] = [];
  for (const extraction of extractions) {
    const chunkArrivalMs = parseInstant(extraction.chunk_arrival_time);
    const naturalDecayMs = parseInstant(extraction.natural_decay_time);
    if (chunkArrivalMs === null || naturalDecayMs === null) continue;
    sources.push({
      structureId: extraction.structure_id,
      subject: structureNames.get(extraction.structure_id) ?? `Moon ${extraction.moon_id}`,
      chunkArrivalMs,
      naturalDecayMs,
    });
  }
  return sources;
}

export function toBoardJobs(
  jobs: readonly CorporationIndustryJob[],
  typeNames: ReadonlyMap<number, string>
): BoardJobSource[] {
  const sources: BoardJobSource[] = [];
  for (const job of jobs) {
    const endMs = parseInstant(job.end_date);
    if (endMs === null) continue;
    const typeId = job.product_type_id ?? job.blueprint_type_id;
    const productName =
      (job.product_type_id === undefined ? undefined : typeNames.get(job.product_type_id)) ??
      typeNames.get(job.blueprint_type_id);
    sources.push({
      jobId: job.job_id,
      subject: productName ?? `#${job.job_id}`,
      endMs,
      status: job.status,
      typeId,
    });
  }
  return sources;
}

export function jobTypeIds(jobs: readonly CorporationIndustryJob[]): number[] {
  const ids = new Set<number>();
  for (const job of jobs) {
    if (job.product_type_id !== undefined) ids.add(job.product_type_id);
    ids.add(job.blueprint_type_id);
  }
  return [...ids];
}
