/** Colours shared by the Local list and the pilot modal, so a space or a standing reads the same in both. */
import type { AgeTone, KillSpace } from '@/engine/pilotList/killActivity';

export const SPACE_TEXT: Record<KillSpace, string> = {
  highsec: 'text-success',
  lowsec: 'text-warning',
  nullsec: 'text-danger',
  wormhole: 'text-accent',
};

export const SPACE_BAR: Record<KillSpace, string> = {
  highsec: 'bg-success',
  lowsec: 'bg-warning',
  nullsec: 'bg-danger',
  wormhole: 'bg-accent',
};

/** How recent a last kill reads: the fresh ones are brighter, never dimmed below AA contrast. */
export const AGE_TEXT: Record<AgeTone, string> = {
  fresh: 'font-semibold text-text',
  week: 'text-text-dim',
  old: 'text-text-dim',
  none: 'text-text-dim',
};
