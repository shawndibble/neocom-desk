import { formatCount } from '@/lib/formatCount';
import type { Translate } from '@/lib/translate';
import { mergeCostLines } from '@/engine/industry/mergeCostLines';
import type { ResolvedMaterial, ResolvedSubBuild } from '@/engine/industry/materialResolution';
import { resolvedSubBuildSeconds } from '@/engine/industry/materialResolution';
import type { AcquisitionTier, MaterialCostLine } from '@/engine/industry/types';

export interface MaterialTableRow extends MaterialCostLine {
  subBuilds: readonly ResolvedSubBuild[];
  acquisitionTier?: AcquisitionTier;
}

function mergeInto(rows: Map<number, MaterialTableRow>, material: ResolvedMaterial): void {
  const { subBuild, ...line } = material;
  const existing = rows.get(material.typeID);
  if (!existing) {
    rows.set(material.typeID, { ...line, subBuilds: subBuild ? [subBuild] : [] });
    return;
  }
  rows.set(material.typeID, {
    ...mergeCostLines(existing, line),
    subBuilds: subBuild ? [...existing.subBuilds, subBuild] : existing.subBuilds,
  });
}

function costLine(
  row: MaterialTableRow
): MaterialCostLine & { acquisitionTier?: MaterialTableRow['acquisitionTier'] } {
  return {
    typeID: row.typeID,
    baseQuantity: row.baseQuantity,
    quantity: row.quantity,
    ownedQuantity: row.ownedQuantity,
    remainingQuantity: row.remainingQuantity,
    unitPrice: row.unitPrice,
    lineCost: row.lineCost,
    unpriced: row.unpriced,
    ...(row.acquisitionTier !== undefined ? { acquisitionTier: row.acquisitionTier } : {}),
  };
}

export function materialTableRows(materials: readonly ResolvedMaterial[]): MaterialTableRow[] {
  const rows = new Map<number, MaterialTableRow>();
  let level: readonly ResolvedMaterial[] = materials;
  while (level.length > 0) {
    const next: ResolvedMaterial[] = [];
    for (const material of level) {
      mergeInto(rows, material);
      if (material.subBuild) next.push(...material.subBuild.inputs);
    }
    level = next;
  }
  return [...rows.values()];
}

export interface BuildRecipeInput extends MaterialCostLine {
  built: boolean;
}

export function jobsOfRuns(t: Translate, jobRuns: readonly number[]): string {
  const longest = Math.max(...jobRuns);
  const even = jobRuns.every((r) => r === longest);
  return t(even ? 'industry.jobsOfRuns' : 'industry.jobsOfUpToRuns', {
    count: longest,
    jobs: formatCount(jobRuns.length),
    runs: formatCount(longest),
  });
}

export interface BuildRecipe {
  typeID: number;
  runs: number;
  jobRuns: number[];
  split: boolean;
  outputPerRun: number;
  unitsMade: number;
  needed: number;
  spare: number;
  me: number;
  seconds: number;
  jobFees: number;
  unitCost: number | null;
  inputs: BuildRecipeInput[];
}

export function buildRecipe(row: MaterialTableRow): BuildRecipe | null {
  const first = row.subBuilds[0];
  if (!first) return null;

  const inputs = new Map<number, MaterialTableRow>();
  for (const job of row.subBuilds) {
    for (const input of job.inputs) mergeInto(inputs, input);
  }

  const sum = (pick: (job: ResolvedSubBuild) => number) =>
    row.subBuilds.reduce((total, job) => total + pick(job), 0);
  const unitsMade = sum((job) => job.unitsMade);
  const poisoned = row.subBuilds.some((job) => job.unitCost === null);

  return {
    typeID: row.typeID,
    runs: sum((job) => job.runs),
    jobRuns: row.subBuilds.flatMap((job) => job.jobRuns),
    split: row.subBuilds.some((job) => job.jobRuns.length > 1),
    outputPerRun: first.outputPerRun,
    me: first.me,
    unitsMade,
    needed: sum((job) => job.needed),
    spare: sum((job) => job.spare),
    seconds: sum((job) => job.seconds),
    jobFees: sum((job) => job.jobFee.total),
    unitCost: poisoned || unitsMade === 0 ? null : sum((job) => job.totalCost) / unitsMade,
    inputs: [...inputs.values()].map((input) => ({
      ...costLine(input),
      built: input.subBuilds.length > 0,
    })),
  };
}

export function shoppingListMaterials(materials: readonly ResolvedMaterial[]): MaterialCostLine[] {
  const merged = new Map<number, MaterialTableRow>();

  const visit = (list: readonly ResolvedMaterial[]) => {
    for (const material of list) {
      if (material.subBuild) {
        visit(material.subBuild.inputs);
        continue;
      }
      mergeInto(merged, material);
    }
  };
  visit(materials);
  return [...merged.values()].map(costLine);
}

export const subBuildSeconds = resolvedSubBuildSeconds;

export function hasSubBuilds(materials: readonly ResolvedMaterial[]): boolean {
  return materials.some((material) => material.subBuild !== undefined);
}

export interface MaterialConsumer {
  typeID: number;
  runs: number;
  quantity: number;
}

export function materialConsumers(
  materials: readonly ResolvedMaterial[],
  typeID: number,
  mainJob: { typeID: number; runs: number }
): MaterialConsumer[] {
  const consumers: MaterialConsumer[] = [];
  const own = materials.find((material) => material.typeID === typeID);
  if (own) consumers.push({ ...mainJob, quantity: own.quantity });

  let level = materials;
  while (level.length > 0) {
    const next: ResolvedMaterial[] = [];
    for (const material of level) {
      const job = material.subBuild;
      if (!job) continue;
      const input = job.inputs.find((candidate) => candidate.typeID === typeID);
      if (input) consumers.push({ typeID: job.typeID, runs: job.runs, quantity: input.quantity });
      next.push(...job.inputs);
    }
    level = next;
  }
  return consumers;
}
