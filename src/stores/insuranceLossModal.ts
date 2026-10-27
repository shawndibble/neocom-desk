/**
 * Which insurance payout's loss the Wallet journal is showing. Held above the
 * table, not in the row: a virtualized row unmounts as it scrolls out of
 * range, which would close the modal under the reader.
 */
import { create } from 'zustand';

export interface InsuranceLossRequest {
  /** The journal line's `date`. */
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
