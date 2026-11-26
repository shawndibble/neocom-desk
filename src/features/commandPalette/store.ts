import { create } from 'zustand';

interface CommandPaletteState {
  readonly open: boolean;
  show: () => void;
  hide: () => void;
  toggle: () => void;
}

export const useCommandPalette = create<CommandPaletteState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open })),
}));
