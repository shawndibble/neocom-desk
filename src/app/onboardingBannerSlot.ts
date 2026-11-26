import { useEffect } from 'react';
import { create } from 'zustand';

export const ONBOARDING_BANNER_PRIORITY = ['corp-grant', 'install'] as const;

export type OnboardingBannerId = (typeof ONBOARDING_BANNER_PRIORITY)[number];

export type OnboardingBannerEligibility = Partial<Record<OnboardingBannerId, boolean>>;

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
  setEligible: (id, eligible) =>
    set((state) =>
      state.eligible[id] === eligible ? state : { eligible: { ...state.eligible, [id]: eligible } }
    ),
}));

export function useOnboardingBannerSlot(id: OnboardingBannerId, eligible: boolean): boolean {
  const setEligible = useOnboardingBannerSlots((state) => state.setEligible);
  const visible = useOnboardingBannerSlots((state) => selectVisibleBanner(state.eligible));

  useEffect(() => {
    setEligible(id, eligible);
    return () => setEligible(id, false);
  }, [id, eligible, setEligible]);

  return visible === id;
}
