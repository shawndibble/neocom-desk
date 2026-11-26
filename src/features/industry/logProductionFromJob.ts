import { db, type BuildPlanRecord } from '@/db';
import { loadBlueprintCatalog } from './blueprintCatalog';
import { loadNewPlanHubInputs, mostRecentlyUpdatedPlan, newBuildPlan } from './newBuildPlan';
import { createBuildPlans } from './buildPlanStore';
import { loadActivityFacilityDefaults } from './facilityDefaults';
import type { ActiveJob } from './jobs';

export interface JobProductionSeed {
  runs: number;
  jobFee: number;
  jobId?: number;
}

export function jobProductionSeed(
  job: Pick<ActiveJob, 'runs' | 'cost'> & Partial<Pick<ActiveJob, 'job_id'>>
): JobProductionSeed {
  return {
    runs: job.runs,
    jobFee: job.cost ?? 0,
    ...(job.job_id !== undefined && { jobId: job.job_id }),
  };
}

export async function findMatchingBuildPlans(
  characterId: number,
  job: Pick<ActiveJob, 'blueprint_type_id'>
): Promise<BuildPlanRecord[]> {
  const plans = await db.buildPlans.where('characterId').equals(characterId).toArray();
  return plans.filter((plan) => plan.blueprintTypeID === job.blueprint_type_id);
}

export async function createBuildPlanForJob(
  characterId: number,
  job: Pick<ActiveJob, 'blueprint_type_id'>
): Promise<string | null> {
  const catalog = await loadBlueprintCatalog();
  const entry = catalog.byBlueprintTypeID.get(job.blueprint_type_id);
  if (!entry) return null;
  const existing = await db.buildPlans.where('characterId').equals(characterId).toArray();
  await loadNewPlanHubInputs();
  const plan = newBuildPlan(
    characterId,
    entry,
    null,
    mostRecentlyUpdatedPlan(existing),
    await loadActivityFacilityDefaults()
  );
  await createBuildPlans([plan]);
  return plan.id;
}
