import { registerTestReset } from '@/lib/testResets';
import { forgetVettingReview } from './vettingReviewCache';
import { clearVettingRawStore } from './vettingRawStore';

export function clearVettingSession(): void {
  forgetVettingReview();
  clearVettingRawStore();
}

registerTestReset(clearVettingSession);
