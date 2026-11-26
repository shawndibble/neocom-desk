import {
  JOB_SLOT_CATEGORIES,
  slotFreeTimes,
  type JobSlotCategory,
  type JobSlotJob,
  type JobSlotSkills,
} from './jobSlots';

export interface ScheduleNode {
  id: string;
  seconds: number;
  category: JobSlotCategory;
  deps: readonly string[];
  secondsByCharacter?: ReadonlyMap<number, number>;
}

export interface ScheduleCharacter {
  characterId: number;
  skills: JobSlotSkills;
  jobs: readonly JobSlotJob[];
}

export interface ScheduledJob {
  id: string;
  characterId?: number;
  startMs: number;
  finishMs: number;
  stage: number;
}

export interface ScheduleStage {
  startMs: number;
  jobIds: string[];
}

export interface JobSchedule {
  jobs: ScheduledJob[];
  stages: ScheduleStage[];
  finishMs: number;
  peakSlots: number;
}

export function scheduleJobs(
  nodes: readonly ScheduleNode[],
  character: { skills: JobSlotSkills; jobs: readonly JobSlotJob[] },
  nowMs: number
): JobSchedule {
  const schedule = scheduleJobsAcrossCharacters(
    nodes.map((n) => ({ ...n, secondsByCharacter: undefined })),
    [{ characterId: 0, ...character }],
    nowMs
  );
  return {
    ...schedule,
    jobs: schedule.jobs.map((job) => ({ ...job, characterId: undefined })),
  };
}

export function scheduleJobsAcrossCharacters(
  nodes: readonly ScheduleNode[],
  characters: readonly ScheduleCharacter[],
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
  const remainingPathSeconds = new Array<number>(nodes.length);
  const visiting = new Set<number>();
  const visitStage = (i: number): number => {
    if (stage[i] !== undefined) return stage[i];
    if (visiting.has(i)) throw new Error(`Job dependency cycle at ${nodes[i].id}`);
    visiting.add(i);
    stage[i] = nodes[i].deps.reduce((h, dep) => Math.max(h, visitStage(index.get(dep)!) + 1), 0);
    visiting.delete(i);
    return stage[i];
  };
  const visitTail = (i: number): number =>
    (remainingPathSeconds[i] ??=
      nodes[i].seconds + parents[i].reduce((m, p) => Math.max(m, visitTail(p)), 0));
  nodes.forEach((_, i) => visitStage(i));
  nodes.forEach((_, i) => visitTail(i));

  const slots = characters.map(
    (character) =>
      Object.fromEntries(
        JOB_SLOT_CATEGORIES.map((c) => [c, slotFreeTimes(character, c, nowMs)])
      ) as Record<JobSlotCategory, number[]>
  );
  const options = nodes.map((n) => {
    const eligible = characters.flatMap((c, ci) => {
      const seconds = n.secondsByCharacter ? n.secondsByCharacter.get(c.characterId) : n.seconds;
      return seconds === undefined ? [] : [{ ci, seconds }];
    });
    if (eligible.length === 0) throw new Error(`No Character can run job ${n.id}`);
    return eligible;
  });

  const startMs = new Array<number>(nodes.length);
  const finishMs = new Array<number>(nodes.length);
  const runBy = new Array<number>(nodes.length);
  const scheduled = new Array<boolean>(nodes.length).fill(false);
  for (let done = 0; done < nodes.length; done++) {
    let pick = -1;
    let pickStart = Infinity;
    let pickSlot = -1;
    let pickChar = -1;
    nodes.forEach((n, i) => {
      if (scheduled[i] || !n.deps.every((dep) => scheduled[index.get(dep)!])) return;
      const ready = n.deps.reduce((t, dep) => Math.max(t, finishMs[index.get(dep)!]), nowMs);
      let start = Infinity;
      let slot = -1;
      let char = -1;
      let bestFinish = Infinity;
      for (const { ci, seconds } of options[i]) {
        const pool = slots[ci][n.category];
        let s = 0;
        for (let k = 1; k < pool.length; k++) if (pool[k] < pool[s]) s = k;
        if (s >= pool.length) continue;
        const candidateStart = Math.max(ready, pool[s]);
        const candidateFinish = candidateStart + seconds * 1000;
        if (candidateFinish < bestFinish) {
          bestFinish = candidateFinish;
          start = candidateStart;
          slot = s;
          char = ci;
        }
      }
      if (char < 0) return;
      if (
        start < pickStart ||
        (start === pickStart && remainingPathSeconds[i] > remainingPathSeconds[pick])
      ) {
        pick = i;
        pickStart = start;
        pickSlot = slot;
        pickChar = char;
      }
    });
    if (pick < 0) throw new Error('No Character has a free slot for the remaining jobs');
    const n = nodes[pick];
    scheduled[pick] = true;
    startMs[pick] = pickStart;
    runBy[pick] = pickChar;
    finishMs[pick] = pickStart + options[pick].find((o) => o.ci === pickChar)!.seconds * 1000;
    slots[pickChar][n.category][pickSlot] = finishMs[pick];
  }

  const jobs = nodes.map((n, i) => ({
    id: n.id,
    startMs: startMs[i],
    finishMs: finishMs[i],
    stage: stage[i],
    characterId: characters[runBy[i]].characterId,
  }));

  const stages: ScheduleStage[] = [];
  for (const job of jobs) {
    const s = (stages[job.stage] ??= { startMs: job.startMs, jobIds: [] });
    s.startMs = Math.min(s.startMs, job.startMs);
    s.jobIds.push(job.id);
  }

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
