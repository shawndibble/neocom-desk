import { createContext } from 'react';

/**
 * Where Improve's Skills control and its panel sit in the panel's header, for
 * `ImproveTrain` (which owns the skill data) to portal into.
 */
export interface ImproveSkillsSlot {
  /** The right-hand end of the Search settings row. */
  trigger: HTMLElement | null;
  /** The shared expansion area, mounted while Skills is open. */
  panel: HTMLElement | null;
  open: boolean;
  onToggle: () => void;
  /** For the trigger's `aria-controls`. */
  panelId: string;
}

export const ImproveSkillsSlotContext = createContext<ImproveSkillsSlot | null>(null);
