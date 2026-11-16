/**
 * The Improve search, outside React: `runImproveSearch` asks its ports for
 * stats, checks and prices, reports progress through its events, and ends in
 * one `ImproveOutcome` (null when cancelled). `createImprovePorts` is the
 * production adapter; tests hand in their own over the real engine.
 */
export { runImproveSearch } from './run';
export { createImprovePorts } from './ports';
export type { ImproveOutcome, ImproveRequest, ImproveSearchPorts } from './types';
