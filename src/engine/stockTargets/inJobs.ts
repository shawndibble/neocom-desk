const MANUFACTURING_ACTIVITY = 1;
const REACTION_ACTIVITY = 11;

export interface StockJobInput {
  activityId: number;
  productTypeId?: number;
  runs: number;
  unitsPerRun?: number;
  outputLocationId?: number;
  endDate: string;
}

export interface JobStock {
  units: number;
  earliestEnd: string;
}

export interface JobsAtMarket {
  byType: Map<number, JobStock>;
  elsewhere: number;
}

export function jobsAtMarket(
  jobs: readonly StockJobInput[],
  locationId: number,
  typeIds: readonly number[]
): JobsAtMarket {
  const wanted = new Set(typeIds);
  const byType = new Map<number, JobStock>();
  let elsewhere = 0;
  for (const job of jobs) {
    if (job.activityId !== MANUFACTURING_ACTIVITY && job.activityId !== REACTION_ACTIVITY) continue;
    if (job.productTypeId === undefined || !wanted.has(job.productTypeId)) continue;
    if (job.outputLocationId !== locationId) {
      elsewhere += 1;
      continue;
    }
    if (job.unitsPerRun === undefined || job.unitsPerRun <= 0 || job.runs <= 0) continue;
    const units = job.runs * job.unitsPerRun;
    const have = byType.get(job.productTypeId);
    byType.set(job.productTypeId, {
      units: (have?.units ?? 0) + units,
      earliestEnd:
        have === undefined || Date.parse(job.endDate) < Date.parse(have.earliestEnd)
          ? job.endDate
          : have.earliestEnd,
    });
  }
  return { byType, elsewhere };
}
