import { diffJobReady } from './jobReady';

export interface IndustryJobEntrySnapshot {
  jobId: number;
  /** Epoch ms this job finishes (ESI's `end_date`, fixed once the job is started). */
  endMs: number;
  blueprintTypeId: number;
  productTypeId: number | null;
  activityId: number;
}

export interface IndustryJobSnapshot {
  entries: readonly IndustryJobEntrySnapshot[];
  nowMs: number;
}

export interface IndustryJobNotificationFire {
  eventId: 'industryJobComplete';
  characterId: number;
  jobId: number;
  blueprintTypeId: number;
  productTypeId: number | null;
  activityId: number;
  /** The job's `end_date` — already past when this fires, so it dates the feed row. */
  endMs: number;
}

export function diffIndustryJobComplete(
  characterId: number,
  prev: IndustryJobSnapshot | undefined,
  next: IndustryJobSnapshot
): IndustryJobNotificationFire[] {
  return diffJobReady('industryJobComplete', characterId, prev, next);
}
