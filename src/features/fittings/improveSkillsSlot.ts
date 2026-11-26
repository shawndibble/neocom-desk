import { createContext } from 'react';

export interface ImproveSkillsSlot {
  trigger: HTMLElement | null;
  panel: HTMLElement | null;
  open: boolean;
  onToggle: () => void;
  panelId: string;
}

export const ImproveSkillsSlotContext = createContext<ImproveSkillsSlot | null>(null);
