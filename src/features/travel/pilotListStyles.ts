/**
 * Colours shared by the Local list and the pilot modal, so a space or a standing reads the same in both.
 * Red is not a space colour: it is the Threat verdict's, so nullsec is its own hue (DESIGN.md "Kind of space").
 */
import type { AgeTone, KillSpace } from '@/engine/pilotList/killActivity';

export const SPACE_TEXT: Record<KillSpace, string> = {
  highsec: 'text-success',
  lowsec: 'text-warning',
  nullsec: 'text-space-nullsec',
  wormhole: 'text-space-wormhole',
};

/** The 2px rule over a kind-of-space count in the pilot modal; no hue until a kill was there. */
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

/** How recent a last kill reads: the fresh ones are brighter, never dimmed below AA contrast. */
export const AGE_TEXT: Record<AgeTone, string> = {
  fresh: 'font-semibold text-text',
  week: 'text-text-dim',
  old: 'text-text-dim',
  none: 'text-text-dim',
};
