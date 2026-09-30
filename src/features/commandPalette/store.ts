import { create } from 'zustand';

interface CommandPaletteState {
  readonly open: boolean;
  show: () => void;
  hide: () => void;
  toggle: () => void;
}

/**
 * Whether the Command Palette is open. A store rather than `Layout` state so
 * the triggers (rail, phone) and the Ctrl+K listener can open it without the
 * shell itself re-rendering — only `CommandPaletteHost` subscribes.
 */
export const useCommandPalette = create<CommandPaletteState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open })),
}));
