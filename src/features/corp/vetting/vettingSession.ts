import { forgetVettingReview } from './vettingReviewCache';
import { clearVettingRawStore } from './vettingRawStore';

/** Forgets every review and kept row held in memory: on sign-out, a switch, and leaving Vetting. */
export function clearVettingSession(): void {
  forgetVettingReview();
  clearVettingRawStore();
}
