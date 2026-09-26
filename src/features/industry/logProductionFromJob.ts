/**
 * Resolves a completed job's "Log production…" row action (issue #1787) to a
 * target Build Plan: the character's own plans building the job's blueprint,
 * or a freshly created one when none exist. `ActiveJobsPanel` picks among the
 * result (0/1/many) and navigates the pilot to whichever plan wins, carrying
 * the job's own runs/cost as a `jobProductionSeed` for the plan page to
 * prefill Log Production with — see `BuildPlanDetail`'s `pendingLogProduction`.
 */
import { db, type BuildPlanRecord } from '@/db';
import { loadBlueprintCatalog } from './blueprintCatalog';
import { mostRecentlyUpdatedPlan, newBuildPlan } from './newBuildPlan';
import { createBuildPlans } from './buildPlanStore';
import type { ActiveJob } from './jobs';

/** The job-derived numbers Log Production should start from, once a target plan is known. */
export interface JobProductionSeed {
  runs: number;
  jobFee: number;
}

export function jobProductionSeed(job: Pick<ActiveJob, 'runs' | 'cost'>): JobProductionSeed {
  return { runs: job.runs, jobFee: job.cost ?? 0 };
}

/** The character's own Build Plans that build this job's blueprint — the candidates "Log production…" resolves against. */
export async function findMatchingBuildPlans(
  characterId: number,
  job: Pick<ActiveJob, 'blueprint_type_id'>
): Promise<BuildPlanRecord[]> {
  const plans = await db.buildPlans.where('characterId').equals(characterId).toArray();
  return plans.filter((plan) => plan.blueprintTypeID === job.blueprint_type_id);
}

/**
 * Creates a sensibly-defaulted Build Plan for a job with no existing match
 * (same defaulting `newBuildPlan` gives every other creation path — facility/
 * hub/ME/TE from the character's most recent plan). Returns its id, or null
 * if the job's blueprint isn't in the SDE catalog (not expected for a real
 * ESI job).
 */
export async function createBuildPlanForJob(
  characterId: number,
  job: Pick<ActiveJob, 'blueprint_type_id'>
): Promise<string | null> {
  const catalog = await loadBlueprintCatalog();
  const entry = catalog.byBlueprintTypeID.get(job.blueprint_type_id);
  if (!entry) return null;
  const existing = await db.buildPlans.where('characterId').equals(characterId).toArray();
  const plan = newBuildPlan(characterId, entry, null, mostRecentlyUpdatedPlan(existing));
  await createBuildPlans([plan]);
  return plan.id;
}
