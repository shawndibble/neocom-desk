/**
 * The review the report last opened, so the data page one click away does not open it again:
 * every open is logged where the pilot sees it, and "Data we read" is part of the same visit.
 * A direct visit to the data page finds nothing here and opens the review itself.
 */
import type { VettingReview } from '@/engine/vetting';

let last: { key: string; review: VettingReview; at: number } | null = null;

/** Past this the review is opened again, so a lost role or a deleted review is noticed. */
const TTL_MS = 10 * 60_000;

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
  return Date.now() - last.at > TTL_MS ? null : last.review;
}

export function forgetVettingReview(): void {
  last = null;
}
