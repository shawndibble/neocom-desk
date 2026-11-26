import type { IndustryJob } from '@/esi/endpoints';
import { readCachedRows } from '@/esi/cache';
import type { StockJobInput } from '@/engine/stockTargets/inJobs';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { isOpenJob } from '@/features/industry/jobHistory';
import { KEYS as JOB_KEYS, loadAllCharactersIndustryJobs } from '@/features/industry/jobs';

export interface StockJobsRead {
  jobs: StockJobInput[];
  oldestFetchedAt: Date | null;
}

const NONE: StockJobsRead = { jobs: [], oldestFetchedAt: null };

function unitsPerRun(catalog: BlueprintCatalog, job: IndustryJob): number | undefined {
  const products = catalog.byBlueprintTypeID.get(job.blueprint_type_id)?.blueprint.products ?? [];
  return products.find((product) => product.typeID === job.product_type_id)?.quantity;
}

function adapt(jobs: readonly IndustryJob[], catalog: BlueprintCatalog): StockJobInput[] {
  return jobs.filter(isOpenJob).map((job) => ({
    activityId: job.activity_id,
    productTypeId: job.product_type_id,
    runs: job.runs,
    unitsPerRun: unitsPerRun(catalog, job),
    outputLocationId: job.output_location_id,
    endDate: job.end_date,
  }));
}

function oldest(times: readonly number[]): Date | null {
  return times.length > 0 ? new Date(Math.min(...times)) : null;
}

export async function readStockJobs(): Promise<StockJobsRead> {
  try {
    const [{ entries }, catalog] = await Promise.all([
      loadAllCharactersIndustryJobs(),
      loadBlueprintCatalog(),
    ]);
    const cached = entries.flatMap((entry) => (entry.result.cached ? [entry.result.cached] : []));
    return {
      jobs: cached.flatMap((result) => adapt(result.data, catalog)),
      oldestFetchedAt: oldest(cached.map((result) => result.fetchedAt.getTime())),
    };
  } catch {
    return NONE;
  }
}

export async function readCachedStockJobs(characterIds: readonly number[]): Promise<StockJobsRead> {
  try {
    const [rows, catalog] = await Promise.all([
      readCachedRows<IndustryJob[]>(characterIds, JOB_KEYS.jobs),
      loadBlueprintCatalog(),
    ]);
    const cached = [...rows.values()];
    return {
      jobs: cached.flatMap((result) => adapt(result.data, catalog)),
      oldestFetchedAt: oldest(cached.map((result) => result.fetchedAt.getTime())),
    };
  } catch {
    return NONE;
  }
}
