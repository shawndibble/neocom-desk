/**
 * The wording of the two nearby alerts (issues #3542, #4784), as a function of
 * a translator rather than the app's i18next instance, so the Foreground
 * Poller and the service worker (a server push, issue #5122) say exactly the
 * same thing. Everything it reads lives under `notifications.fired`, the one
 * subtree the worker loads (`pushHandler.ts`).
 */
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

/**
 * A planet's name already leads with its system ("60M-TG I"), so naming the
 * system again reads twice; an unresolved planet is a generic skyhook, not an id.
 */
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
