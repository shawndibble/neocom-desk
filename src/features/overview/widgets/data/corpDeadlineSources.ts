/**
 * One corporation's Due soon reads as the corp board's sources. Shared by the
 * Due soon widget and the Calendar, so both rank the same deadline rows.
 */
import { buildCorpBoard, type CorpBoardSources } from '@/engine/corp/board';
import { toBoardJobs } from '@/features/corp/boardSources';
import { CORP_CACHE_WINDOW_MS } from '../../data/corpCards';
import type { CorpDeadlinesSlice } from './corpFeeds';
import { toBoardHubFuel, toBoardSovereignty } from './corpSovereigntyModels';
import { toBoardStarbases } from './corpStarbaseModels';

/** The Due soon sources a corporation's slice can carry. */
export type CorpDeadlineSource = Exclude<keyof CorpDeadlinesSlice, 'corporationId' | 'failed'>;

/** One corporation's Due soon reads, whatever scope fetched them; absent or null means not read. */
export type DeadlineReads = Partial<Pick<CorpDeadlinesSlice, CorpDeadlineSource>>;

/** The readable reads as the board's sources, and when they landed. */
export function readableSources(reads: DeadlineReads, now: number) {
  // A source this Character cannot read contributes undefined, never [].
  const structures = reads.structures?.structures ?? undefined;
  // `chunks` says whether the read was allowed; `extractions` is what the board ranks.
  const chunks = reads.moonChunks?.chunks ?? undefined;
  const extractions = chunks ? (reads.moonChunks?.extractions ?? []) : undefined;
  const jobs = reads.jobs?.readable ? reads.jobs : undefined;
  const towers = reads.starbases?.readable ? reads.starbases : undefined;
  const raids = reads.sovereignty?.readable ? reads.sovereignty : undefined;
  const fetched = [
    structures ? reads.structures?.fetchedAt : null,
    chunks ? reads.moonChunks?.fetchedAt : null,
    jobs?.fetchedAt,
    towers?.fetchedAt,
    raids?.fetchedAt,
  ].filter((at): at is Date => at instanceof Date);
  return {
    readable:
      structures !== undefined ||
      chunks !== undefined ||
      jobs !== undefined ||
      towers !== undefined ||
      raids !== undefined,
    sources: {
      structures,
      extractions,
      jobs: jobs ? toBoardJobs(jobs.jobs, jobs.typeNames) : undefined,
      starbases: towers ? toBoardStarbases(towers, now) : undefined,
      sovereignty: raids ? toBoardSovereignty(raids) : undefined,
      hubFuel: raids ? toBoardHubFuel(raids) : undefined,
    } satisfies Omit<CorpBoardSources, 'nowMs' | 'staleWindowMs'>,
    fetched,
    fromCache: Boolean(jobs?.fromCache),
  };
}

export const boardOf = (
  sources: ReturnType<typeof readableSources>['sources'],
  now: number,
  options: Pick<CorpBoardSources, 'includeRunningJobs'> = {}
) => buildCorpBoard({ nowMs: now, staleWindowMs: CORP_CACHE_WINDOW_MS, ...sources, ...options });
