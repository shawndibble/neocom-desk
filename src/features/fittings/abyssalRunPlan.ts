/** Planner picks the weather picker lacks: filament tier, activation security. Session-only, not saved. */
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
