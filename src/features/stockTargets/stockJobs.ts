/**
 * The impure half of **In jobs** (issue #6429): every Character's active
 * industry jobs, read and adapted to the pure `engine/stockTargets/inJobs`
 * input with each job's units per run taken from the blueprint catalog.
 *
 * Active jobs only: a delivered job has left this list and its units are in the
 * assets, so reading assets and jobs together counts each unit once. Corporation
 * jobs are not read at all.
 */
import type { IndustryJob } from '@/esi/endpoints';
import { readCachedRows } from '@/esi/cache';
import type { StockJobInput } from '@/engine/stockTargets/inJobs';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { isOpenJob } from '@/features/industry/jobHistory';
import { KEYS as JOB_KEYS, loadAllCharactersIndustryJobs } from '@/features/industry/jobs';

export interface StockJobsRead {
  jobs: StockJobInput[];
  /** The oldest jobs read behind the counts, or null when none was read. */
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

/** Cache-first through the Active jobs loader: the Stock tab's own read. Never throws. */
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

/** Cache only, for the foreground poll and the Overview card: a live read would fan out per Character. Never throws. */
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
