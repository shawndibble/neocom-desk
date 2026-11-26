import type { IncursionNearbyFire } from '@/engine/incursions/incursionAlert';
import type { SkyhookRaidableNearbyFire } from '@/engine/skyhooks/skyhookAlert';
import type { NotificationCopy } from '@/engine/notificationWording';
import { formatCountdown } from '@/lib/duration';

import type { Translate } from '@/lib/translate';

export interface SkyhookNames {
  readonly planet?: string;
  readonly system?: string;
}

export interface IncursionNames {
  readonly constellation?: string;
  readonly system?: string;
}

const fired = (t: Translate, eventId: string, variant: string, vars?: Record<string, unknown>) =>
  t(`notifications.fired.${eventId}.${variant}`, vars);

function whereLabel(t: Translate, names: SkyhookNames, systemId: number): string {
  const system = names.system ?? `#${systemId}`;
  if (names.planet === undefined) {
    return fired(t, 'skyhookRaidableNearby', 'whereUnnamed', { system });
  }
  if (names.system !== undefined && names.planet.startsWith(`${names.system} `))
    return names.planet;
  return fired(t, 'skyhookRaidableNearby', 'whereNamed', { planet: names.planet, system });
}

export function skyhookRaidableNearbyWording(
  t: Translate,
  fire: SkyhookRaidableNearbyFire,
  names: SkyhookNames,
  nowMs: number
): NotificationCopy {
  const open = fire.startMs <= nowMs;
  const duration = formatCountdown(((open ? fire.endMs : fire.startMs) - nowMs) / 1000);
  return {
    title: fired(t, 'skyhookRaidableNearby', 'title', { count: fire.jumps }),
    body: fired(t, 'skyhookRaidableNearby', 'body', {
      where: whereLabel(t, names, fire.systemId),
      window: fired(t, 'skyhookRaidableNearby', open ? 'windowOpen' : 'windowIn', { duration }),
      count: fire.jumps,
    }),
  };
}

export function incursionNearbyWording(
  t: Translate,
  fire: IncursionNearbyFire,
  names: IncursionNames
): NotificationCopy {
  return {
    title: fired(t, 'incursionNearby', 'title', { count: fire.jumps }),
    body: fired(t, 'incursionNearby', 'body', {
      constellation:
        names.constellation ??
        fired(t, 'incursionNearby', 'constellationUnnamed', { id: fire.constellationId }),
      system: names.system ?? `#${fire.stagingSystemId}`,
      state: fired(t, 'incursionNearby', `state.${fire.state}`),
      count: fire.jumps,
    }),
  };
}
