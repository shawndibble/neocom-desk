/**
 * Every colony on one line: how loaded it is, what it needs, when it fills.
 *
 * The tab used to end in a grid of full planet cards — six boxes, each
 * restating what its colony extracts and makes. That grid answered "tell me
 * about this planet" well and answered "which of my planets needs me" not at
 * all, because no two figures were ever in the same column. The worklist above
 * now carries the instructions, so what is left for the colonies to do is the
 * one thing a list does better than a grid: let a pilot run an eye down six
 * planets and see which one is in trouble.
 *
 * So a colony is a row, and a row carries only what ranks: its binding load,
 * how many faults and steps the worklist raised against it, and how long it
 * lasts before it fills. The card is still one click away, because the detail
 * has not stopped mattering — it has stopped being the first thing on screen.
 *
 * ## The load is the binding one, not an average
 *
 * A colony at 95% CPU and 40% Powergrid has no room, and a mean of the two
 * would print 68% and say it has. The higher of the two is the number that
 * decides whether anything else fits, so it is the number the bar draws.
 *
 * ## Unknown is a row, never an absence
 *
 * A colony whose extraction reports no complete program gets a row saying
 * `unknown`, not a missing row and not a zero. Dropping it would quietly
 * shorten the pilot's own colony list; a zero would claim it lasts no time at
 * all. Both are worse than saying what is true.
 */
import type { PlanetType } from '@/esi/endpoints';
import type { Worklist } from './worklistModel';

export interface ColonyStripColony {
  planetId: number;
  name: string | null;
  planetType: PlanetType;
  /**
   * The binding load, as a fraction of budget: the higher of CPU and
   * Powergrid. Null when the colony's budget or draw cannot be read — never 0,
   * which would draw an empty colony.
   */
  load: number | null;
  /**
   * Hours before the colony fills, measured at a fresh program's peak — when
   * it fills fastest. Null when no extractor here reports a complete program.
   */
  hoursToFull: number | null;
}

export interface ColonyStripRow extends ColonyStripColony {
  /** Worklist rows against this planet that are faults: something is broken. */
  faults: number;
  /** Worklist rows against this planet that merely earn more. */
  steps: number;
  /** The colony fills before the pilot's own haul cadence brings them back. */
  overflowing: boolean;
}

/** A colony with a fault outranks one with a step; an unreadable one sinks. */
function rank(row: ColonyStripRow): number {
  if (row.faults > 0) return 0;
  if (row.steps > 0) return 1;
  if (row.hoursToFull === null && row.load === null) return 3;
  return 2;
}

export interface ColonyStripInput {
  colonies: readonly ColonyStripColony[];
  /** Both lists are read: a rebuild is a step against the planet too. */
  worklist: Worklist;
  /** The pilot's own haul window, in hours. */
  haulHours: number;
}

export function colonyStripRows(input: ColonyStripInput): ColonyStripRow[] {
  const { tuning, rebuilds } = input.worklist;
  const faultsBy = new Map<number, number>();
  const stepsBy = new Map<number, number>();

  // `remove` and `haul` are faults: something runs that nothing feeds, or the
  // colony has stopped because it filled up. `add`, `swap` and `rebuild` earn
  // more — worth doing, but nothing about them is broken.
  for (const row of [...tuning, ...rebuilds]) {
    const bucket = row.verb === 'remove' || row.verb === 'haul' ? faultsBy : stepsBy;
    bucket.set(row.planetId, (bucket.get(row.planetId) ?? 0) + 1);
  }

  return input.colonies
    .map((colony) => ({
      ...colony,
      faults: faultsBy.get(colony.planetId) ?? 0,
      steps: stepsBy.get(colony.planetId) ?? 0,
      overflowing: colony.hoursToFull !== null && colony.hoursToFull < input.haulHours,
    }))
    .sort((a, b) => rank(a) - rank(b) || (a.name ?? '').localeCompare(b.name ?? ''));
}
