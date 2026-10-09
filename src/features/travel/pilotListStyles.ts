/** Colours shared by the Local list and the pilot modal, so a space or a standing reads the same in both. */
import type { KillSpace } from '@/engine/pilotList/killActivity';

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
