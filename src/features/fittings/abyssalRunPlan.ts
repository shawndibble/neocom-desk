/**
 * The two answers to "Plan an Abyssal run" that the weather picker doesn't
 * hold: the filament tier and the activation system's security. The weather
 * itself stays the session's one (`useAbyssalWeather`), so the planner and the
 * rest of the page can never disagree. Not saved.
 */
import { create } from 'zustand';
import type { AbyssalSecurity, AbyssalTier } from '@/engine/fittings/abyssalRun';

interface AbyssalRunPlan {
  tier: AbyssalTier;
  security: AbyssalSecurity;
  setTier: (tier: AbyssalTier) => void;
  setSecurity: (security: AbyssalSecurity) => void;
}

export const useAbyssalRunPlan = create<AbyssalRunPlan>((set) => ({
  tier: 3,
  security: 5,
  setTier: (tier) => set({ tier }),
  setSecurity: (security) => set({ security }),
}));
