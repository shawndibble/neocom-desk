/**
 * Slot-aware job schedule for a build tree: when each job starts and finishes
 * on one character's real job slots, sub-jobs in parallel, a parent waiting on
 * every sub-job it consumes. One job per node: a node's runs are never split
 * across slots (the cost engine prices one job per node, and splitting would
 * change per-job ME rounding and job fees).
 *
 * Greedy list scheduling: repeatedly take the ready job (every dependency
 * scheduled) that can start earliest, ties going to the longest remaining path
 * to the root, then input order, and put it on the slot in its pool that frees
 * first. Each pool starts from the slots busy right now.
 */
import {
  JOB_SLOT_CATEGORIES,
  slotFreeTimes,
  type JobSlotCategory,
  type JobSlotJob,
  type JobSlotSkills,
} from './jobSlots';

export interface ScheduleNode {
  id: string;
  /** Job duration. */
  seconds: number;
  category: JobSlotCategory;
  /** Ids of the jobs whose output this job consumes; it starts once all have finished. */
  deps: readonly string[];
}

export interface ScheduledJob {
  id: string;
  startMs: number;
  finishMs: number;
  /** Dependency height: 0 for a job with no sub-jobs, else one more than its tallest sub-job. */
  stage: number;
}

export interface ScheduleStage {
  /** Earliest start among the stage's jobs. */
  startMs: number;
  /** In input order. */
  jobIds: string[];
}

export interface JobSchedule {
  /** In input order. */
  jobs: ScheduledJob[];
  /** Jobs grouped by dependency height, lowest first: the order the tree builds in. */
  stages: ScheduleStage[];
  /** When the last job finishes (`nowMs` with no jobs). */
  finishMs: number;
  /** Most jobs running at once, across every pool. */
  peakSlots: number;
}

export function scheduleJobs(
  nodes: readonly ScheduleNode[],
  character: { skills: JobSlotSkills; jobs: readonly JobSlotJob[] },
  nowMs: number
): JobSchedule {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  for (const n of nodes) {
    for (const dep of n.deps) {
      if (!index.has(dep)) throw new Error(`Job ${n.id} depends on unknown job ${dep}`);
    }
  }

  const parents: number[][] = nodes.map(() => []);
  nodes.forEach((n, i) => n.deps.forEach((dep) => parents[index.get(dep)!].push(i)));

  const stage = new Array<number>(nodes.length);
  const tail = new Array<number>(nodes.length);
  const visiting = new Set<number>();
  const visitStage = (i: number): number => {
    if (stage[i] !== undefined) return stage[i];
    if (visiting.has(i)) throw new Error(`Job dependency cycle at ${nodes[i].id}`);
    visiting.add(i);
    stage[i] = nodes[i].deps.reduce((h, dep) => Math.max(h, visitStage(index.get(dep)!) + 1), 0);
    visiting.delete(i);
    return stage[i];
  };
  // Longest path (in seconds) from a job through its consumers to the root.
  const visitTail = (i: number): number =>
    (tail[i] ??= nodes[i].seconds + parents[i].reduce((m, p) => Math.max(m, visitTail(p)), 0));
  nodes.forEach((_, i) => visitStage(i));
  nodes.forEach((_, i) => visitTail(i));

  const slots = Object.fromEntries(
    JOB_SLOT_CATEGORIES.map((c) => [c, slotFreeTimes(character, c, nowMs)])
  ) as Record<JobSlotCategory, number[]>;

  const startMs = new Array<number>(nodes.length);
  const finishMs = new Array<number>(nodes.length);
  const scheduled = new Array<boolean>(nodes.length).fill(false);
  for (let done = 0; done < nodes.length; done++) {
    let pick = -1;
    let pickStart = Infinity;
    let pickSlot = -1;
    nodes.forEach((n, i) => {
      if (scheduled[i] || !n.deps.every((dep) => scheduled[index.get(dep)!])) return;
      const ready = n.deps.reduce((t, dep) => Math.max(t, finishMs[index.get(dep)!]), nowMs);
      const pool = slots[n.category];
      let slot = 0;
      for (let s = 1; s < pool.length; s++) if (pool[s] < pool[slot]) slot = s;
      const start = Math.max(ready, pool[slot]);
      if (start < pickStart || (start === pickStart && tail[i] > tail[pick])) {
        pick = i;
        pickStart = start;
        pickSlot = slot;
      }
    });
    const n = nodes[pick];
    scheduled[pick] = true;
    startMs[pick] = pickStart;
    finishMs[pick] = pickStart + n.seconds * 1000;
    slots[n.category][pickSlot] = finishMs[pick];
  }

  const jobs = nodes.map((n, i) => ({
    id: n.id,
    startMs: startMs[i],
    finishMs: finishMs[i],
    stage: stage[i],
  }));

  const stages: ScheduleStage[] = [];
  for (const job of jobs) {
    const s = (stages[job.stage] ??= { startMs: job.startMs, jobIds: [] });
    s.startMs = Math.min(s.startMs, job.startMs);
    s.jobIds.push(job.id);
  }

  // A finish at t frees its slot before a start at t takes one.
  const events = jobs
    .flatMap((j) => [
      { at: j.startMs, delta: 1 },
      { at: j.finishMs, delta: -1 },
    ])
    .sort((a, b) => a.at - b.at || a.delta - b.delta);
  let running = 0;
  let peakSlots = 0;
  for (const e of events) {
    running += e.delta;
    peakSlots = Math.max(peakSlots, running);
  }

  return {
    jobs,
    stages: stages.filter(Boolean),
    finishMs: jobs.reduce((t, j) => Math.max(t, j.finishMs), nowMs),
    peakSlots,
  };
}
