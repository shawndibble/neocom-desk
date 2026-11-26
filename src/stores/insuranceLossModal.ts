import { create } from 'zustand';

export interface InsuranceLossRequest {
  payoutDate: string;
  characterId: number;
}

interface InsuranceLossModalState {
  request: InsuranceLossRequest | null;
  open: (request: InsuranceLossRequest) => void;
  close: () => void;
}

export const useInsuranceLossModalStore = create<InsuranceLossModalState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));
