/**
 * The review the report last opened, so the data page one click away does not open it again:
 * every open is logged where the pilot sees it, and "Data we read" is part of the same visit.
 * A direct visit to the data page finds nothing here and opens the review itself.
 */
import type { VettingReview } from '@/engine/vetting';
import { VETTING_CACHE_TTL_MS } from './vettingRawStore';

let last: { key: string; review: VettingReview; at: number } | null = null;

const keyOf = (characterId: number, corporationId: number, reviewId: string) =>
  `${characterId}:${corporationId}:${reviewId}`;

export function rememberVettingReview(
  characterId: number,
  corporationId: number,
  review: VettingReview
): void {
  last = { key: keyOf(characterId, corporationId, review.id), review, at: Date.now() };
}

export function recallVettingReview(
  characterId: number,
  corporationId: number,
  reviewId: string
): VettingReview | null {
  if (last === null || last.key !== keyOf(characterId, corporationId, reviewId)) return null;
  return Date.now() - last.at > VETTING_CACHE_TTL_MS ? null : last.review;
}

export function forgetVettingReview(): void {
  last = null;
}
