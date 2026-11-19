/**
 * The units a pilot's running manufacturing and reaction jobs will deliver to
 * a market's station or structure: the **In jobs** count beside Listed and In
 * hangar on a Stock List row (issue #6429).
 *
 * A job counts only while it is in the active jobs list. Once it delivers it
 * leaves that list and the assets own the units, so a unit is counted in
 * exactly one place. Output location is matched exactly against the market's
 * location id: ESI names a station or structure there for a hangar delivery,
 * and anything else (a container, a corporation facility, a missing field)
 * cannot be placed at the market, so the job is reported as delivering
 * elsewhere rather than guessed at.
 */

const MANUFACTURING_ACTIVITY = 1;
const REACTION_ACTIVITY = 11;

export interface StockJobInput {
  activityId: number;
  productTypeId?: number;
  /** Runs of the job (a BPC job's own runs, not the copy's licensed runs). */
  runs: number;
  /** Units one run yields, from the blueprint; undefined when the blueprint is unknown. */
  unitsPerRun?: number;
  outputLocationId?: number;
  /** ISO end date. */
  endDate: string;
}

export interface JobStock {
  units: number;
  /** The soonest end date among the jobs counted, ISO. */
  earliestEnd: string;
}

export interface JobsAtMarket {
  byType: Map<number, JobStock>;
  /** Jobs making a listed item that deliver somewhere other than the market. */
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
