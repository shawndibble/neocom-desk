import { diffJobReady } from './jobReady';

export interface IndustryJobEntrySnapshot {
  jobId: number;
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
  endMs: number;
}

export function diffIndustryJobComplete(
  characterId: number,
  prev: IndustryJobSnapshot | undefined,
  next: IndustryJobSnapshot
): IndustryJobNotificationFire[] {
  return diffJobReady('industryJobComplete', characterId, prev, next);
}
