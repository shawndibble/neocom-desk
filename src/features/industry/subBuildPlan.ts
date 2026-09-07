/**
 * Turns a Build Plan's resolved materials — `buildVsBuy`'s own output, already
 * recursive (src/engine/industry/materialResolution) — into what the UI
 * needs: one flat row per material, and the leaf list that is actually left to
 * shop for.
 *
 * There is deliberately no second computation of cost here. Before this
 * (docs/context/decisions/20260904-235527, since superseded), a plan's
 * Results panel priced the plan as written while this module separately
 * expanded one level of `buildHere` for the materials table alone — two
 * numbers, one of them stale the moment a player toggled a build. Now
 * `buildVsBuy` itself resolves every `buildHere` choice, at whatever depth,
 * into `result.materials[].subBuild`; this module only walks that tree.
 *
 * **The table is flat, and the tree lives in the modal.** The resolved tree is
 * the right shape to *price* a plan and the wrong shape to *shop* one: a
 * material consumed by six different branches is one thing to acquire, and
 * printing it once per branch — each at its own branch's quantity — turned a
 * fully expanded capital ship into pages of rows where the same mineral
 * appeared seven times and no single number answered "how many do I need".
 * So `materialTableRows` merges the whole tree by typeID: one row per
 * material, its quantity the sum of every branch that wants it, so toggling a
 * build grows the rows its recipe feeds instead of nesting a new level under
 * it. What that flattening costs — seeing which job a quantity came from —
 * `buildRecipe` hands back on demand, per material, which is what the row's
 * "Build it" modal renders.
 */

import type { ResolvedMaterial, ResolvedSubBuild } from '@/engine/industry/materialResolution';
import { resolvedSubBuildSeconds } from '@/engine/industry/materialResolution';
import type { MaterialCostLine } from '@/engine/industry/types';

/** One row of the materials table: a material, summed over every place the plan needs it. */
export interface MaterialTableRow extends MaterialCostLine {
  /**
   * Every job in the resolved tree that produces this material — empty on a
   * row that is bought. Normally one; a material that is both a blueprint
   * material and an input to another built material is built by a job for
   * each, and both belong to this one row.
   */
  subBuilds: readonly ResolvedSubBuild[];
}

/**
 * Adds one resolved node to a merged-by-typeID map, in first-seen order.
 *
 * Quantities are summed as the sub-jobs rounded them: EVE rounds material use
 * once per job, so two jobs that each want 4.5 units of an input cost 5 + 5,
 * not 9 (src/engine/industry/subBuild). Never re-derive a merged quantity
 * from a combined run count.
 *
 * A unit price is a property of the type, not of where it was consumed, so
 * the first real one wins — `null` only ever means "this occurrence is being
 * built", and a built occurrence must not blank the price of a row the plan
 * also buys outright.
 */
function mergeInto(rows: Map<number, MaterialTableRow>, material: ResolvedMaterial): void {
  const { subBuild, ...line } = material;
  const existing = rows.get(material.typeID);
  if (!existing) {
    rows.set(material.typeID, { ...line, subBuilds: subBuild ? [subBuild] : [] });
    return;
  }
  rows.set(material.typeID, {
    ...existing,
    baseQuantity: existing.baseQuantity + line.baseQuantity,
    quantity: existing.quantity + line.quantity,
    ownedQuantity: existing.ownedQuantity + line.ownedQuantity,
    remainingQuantity: existing.remainingQuantity + line.remainingQuantity,
    unitPrice: existing.unitPrice ?? line.unitPrice,
    lineCost: existing.lineCost + line.lineCost,
    unpriced: existing.unpriced || line.unpriced,
    subBuilds: subBuild ? [...existing.subBuilds, subBuild] : existing.subBuilds,
  });
}

/**
 * A merged row as a plain cost line, for a caller that has no use for the jobs
 * behind it. Written out field by field rather than spread-minus-`subBuilds`
 * so a new member of `MaterialCostLine` is a type error here rather than a
 * field that silently stops being carried.
 */
function costLine(row: MaterialTableRow): MaterialCostLine {
  return {
    typeID: row.typeID,
    baseQuantity: row.baseQuantity,
    quantity: row.quantity,
    ownedQuantity: row.ownedQuantity,
    remainingQuantity: row.remainingQuantity,
    unitPrice: row.unitPrice,
    lineCost: row.lineCost,
    unpriced: row.unpriced,
  };
}

/**
 * Every material the plan touches, one row each, merged by type.
 *
 * A built material keeps its row rather than being replaced by its inputs: it
 * is still something the plan has to end up holding, the row is what shows
 * the choice was made, and it is the only place left to click to undo it. Its
 * inputs join the same flat list beside it.
 *
 * Walked a level at a time rather than depth-first, so the plan's own
 * materials come first in blueprint order and the recipes' inputs follow in
 * the order the recipes introduced them — expanding a row appends and grows
 * rows, and never reshuffles the ones around it.
 */
export function materialTableRows(materials: readonly ResolvedMaterial[]): MaterialTableRow[] {
  const rows = new Map<number, MaterialTableRow>();
  // Terminates on its own: `resolveMaterial` bounds the tree with its cycle
  // guard and `MAX_SUB_BUILD_DEPTH`, so there are finitely many levels.
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

/** One ingredient of a build, as the "Build it" modal lists it. */
export interface BuildRecipeInput extends MaterialCostLine {
  /** True when this input is itself being built here, so it has a recipe of its own to open. */
  built: boolean;
}

/** What producing one material actually takes — the whole content of its "Build it" modal. */
export interface BuildRecipe {
  typeID: number;
  /** Job runs to install, summed over every job in the tree that makes this material. */
  runs: number;
  /** Units one run yields — why `runs` is not simply the quantity needed. */
  outputPerRun: number;
  unitsMade: number;
  /** Units the plan needs; below `unitsMade` whenever the output doesn't divide evenly. */
  needed: number;
  spare: number;
  /** ME the jobs are quoted at — the best copy the character owns, else 0. */
  me: number;
  /** These jobs' own duration. A descendant's job time is on that material's own recipe. */
  seconds: number;
  /** These jobs' own installation fees — descendants excluded, for the same reason. */
  jobFees: number;
  /** Rolled-up cost per unit produced; null when something underneath bottoms out unpriced. */
  unitCost: number | null;
  /** What the jobs consume, merged by type — one line however many jobs eat it. */
  inputs: BuildRecipeInput[];
}

/**
 * The recipe behind one flat row, or `null` when that row is bought rather
 * than built.
 *
 * Sourced from the row's own jobs, not from the flat list: a merged row says
 * how many units the whole plan needs, while this says what the jobs covering
 * them consume, and those are different numbers whenever a job's runs round
 * up past what was asked for. The modal has to answer the second question.
 */
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
  // One poisoned job poisons the quote: averaging over only the jobs that do
  // have a cost would read as the cost of all of them.
  const poisoned = row.subBuilds.some((job) => job.unitCost === null);

  return {
    typeID: row.typeID,
    runs: sum((job) => job.runs),
    // `outputPerRun` and `me` come off the first job alone because they are
    // properties of the blueprint and of the copy the character owns — the
    // same for every job producing this material, whichever branch asked.
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

/**
 * What the plan still has to acquire on the open market: every leaf of the
 * resolved tree that is not itself being built, merged by type — three
 * branches that each need the same mineral are one line to order, not three.
 * A built material never appears here itself; what it consumes does, however
 * far down that reaches.
 *
 * Deliberately not the table's rows, which keep a row for every built
 * material too: you cannot buy the thing you decided to make.
 */
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

/** Wall-clock every sub-job in the tree adds before the main run can even be installed. */
export const subBuildSeconds = resolvedSubBuildSeconds;

/**
 * Whether any material on the plan is being built rather than bought. Only
 * the top level is checked because nothing deeper can be built without it: a
 * nested job only exists as an input to the job above it.
 */
export function hasSubBuilds(materials: readonly ResolvedMaterial[]): boolean {
  return materials.some((material) => material.subBuild !== undefined);
}
