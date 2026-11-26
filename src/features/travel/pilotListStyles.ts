import type { AgeTone, KillSpace } from '@/engine/pilotList/killActivity';

export const SPACE_TEXT: Record<KillSpace, string> = {
  highsec: 'text-success',
  lowsec: 'text-warning',
  nullsec: 'text-space-nullsec',
  wormhole: 'text-space-wormhole',
};

export const SPACE_RULE: Record<KillSpace, string> = {
  highsec: 'border-t-success',
  lowsec: 'border-t-warning',
  nullsec: 'border-t-space-nullsec',
  wormhole: 'border-t-space-wormhole',
};

export const SPACE_BAR: Record<KillSpace, string> = {
  highsec: 'bg-success',
  lowsec: 'bg-warning',
  nullsec: 'bg-space-nullsec',
  wormhole: 'bg-space-wormhole',
};

export const AGE_TEXT: Record<AgeTone, string> = {
  fresh: 'font-semibold text-text',
  week: 'text-text-dim',
  old: 'text-text-dim',
  none: 'text-text-dim',
};
