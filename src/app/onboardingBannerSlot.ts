/**
 * One bottom banner at a time (issue #1124).
 *
 * The three one-time onboarding banners are `position: fixed` in the same
 * bottom corner, and a first login on a fresh device can make two or three of
 * them eligible at once — which stacked them up the viewport until they buried
 * the page content behind them on a phone. This is the shared slot they now
 * compete for: every eligible banner registers itself, and only the
 * highest-priority registrant is told to render.
 *
 * A module-level store rather than a context provider because the banners do
 * not share a subtree: `InstallPrompt` is mounted in `App` as a sibling of
 * `Layout`, while the other two are inside it. Nothing here changes any
 * banner's own eligibility, copy, or dismissal — each still decides entirely
 * for itself whether it *wants* the slot.
 */
import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Highest priority first. Corp grant leads because it is the rarest and most
 * perishable — it is offered at the moment a Character becomes a Director and
 * (by design, CONTEXT.md round 42) never again for that scope set. Install
 * comes last: it is the least urgent of the three and is about the device
 * rather than anything the user just did.
 */
export const ONBOARDING_BANNER_PRIORITY = ['corp-grant', 'notifications', 'install'] as const;

export type OnboardingBannerId = (typeof ONBOARDING_BANNER_PRIORITY)[number];

export type OnboardingBannerEligibility = Partial<Record<OnboardingBannerId, boolean>>;

/** The banner that gets the slot, or null when none is eligible. */
export function selectVisibleBanner(
  eligible: OnboardingBannerEligibility
): OnboardingBannerId | null {
  return ONBOARDING_BANNER_PRIORITY.find((id) => eligible[id] === true) ?? null;
}

interface OnboardingBannerSlotState {
  eligible: OnboardingBannerEligibility;
  setEligible: (id: OnboardingBannerId, eligible: boolean) => void;
}

export const useOnboardingBannerSlots = create<OnboardingBannerSlotState>((set) => ({
  eligible: {},
  // Same-value writes return the existing state object untouched: a banner
  // re-registering the answer it already gave must not wake up the other two.
  setEligible: (id, eligible) =>
    set((state) =>
      state.eligible[id] === eligible
        ? state
        : { eligible: { ...state.eligible, [id]: eligible } }
    ),
}));

/**
 * Claim the shared banner slot. Returns true only for the highest-priority
 * eligible banner, so a caller renders exactly when this is true and `null`
 * otherwise.
 *
 * Registration happens in an effect, so on the very first paint of a newly
 * eligible banner nobody holds the slot and nothing renders — a beat late
 * rather than a stack that flashes and then collapses.
 */
export function useOnboardingBannerSlot(id: OnboardingBannerId, eligible: boolean): boolean {
  const setEligible = useOnboardingBannerSlots((state) => state.setEligible);
  const visible = useOnboardingBannerSlots((state) => selectVisibleBanner(state.eligible));

  useEffect(() => {
    setEligible(id, eligible);
    // An unmounted banner is not eligible for anything — release the slot so
    // the next one down can take it.
    return () => setEligible(id, false);
  }, [id, eligible, setEligible]);

  return visible === id;
}
