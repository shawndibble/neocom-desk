/**
 * Names for a pushed EVE notification, resolved inside the service worker
 * (ADR 0020). The app's own lookup (`eveNotificationNames.ts`) reads Dexie and
 * goes through the authenticated ESI client; the worker has neither the tokens
 * nor any reason to carry that code. This is the public half only: one
 * `POST /universe/names` for the ids the body would name, raced against the
 * same `RESOLUTION_BUDGET_MS` the app uses. A structure's name needs a
 * character token, so it is left out and the renderer says `structure #<id>`.
 *
 * Never rejects. Anything missing falls back to an id or a neutral phrase.
 */
import { parseEveNotificationPayload } from '@/engine/eveNotificationPayload';
import type { EveNotificationFire } from '@/engine/notificationDiffs';
import { COMPATIBILITY_DATE } from '@/esi/compatibilityDate';
import { USER_AGENT } from '@/esi/userAgent';
import type { EveNotificationNames } from './eveNotificationRender';
import { entityIdsToResolve, withinBudget } from './eveNotificationNamePlan';

const NAMES_URL = 'https://esi.evetech.net/universe/names';

async function postNames(
  ids: readonly number[],
  fetchImpl: typeof fetch
): Promise<Map<number, string>> {
  const response = await fetchImpl(NAMES_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Compatibility-Date': COMPATIBILITY_DATE,
      'X-User-Agent': USER_AGENT,
    },
    body: JSON.stringify(ids),
  });
  if (!response.ok) return new Map();
  const entries = (await response.json()) as { id: number; name: string }[];
  return new Map(entries.map((entry) => [entry.id, entry.name]));
}

export async function resolvePushNames(
  fire: EveNotificationFire,
  fetchImpl: typeof fetch = fetch
): Promise<EveNotificationNames> {
  try {
    const ids = entityIdsToResolve(fire.type, parseEveNotificationPayload(fire.text));
    if (ids.length === 0) return {};
    const entities = await withinBudget(postNames(ids, fetchImpl), new Map<number, string>());
    return entities.size > 0 ? { entities } : {};
  } catch {
    return {};
  }
}

/**
 * Public names for ids a server-pushed event names (issue #5121: a lost
 * hull and its system), one `POST /universe/names`, within the budget. Never
 * rejects; an id it could not name is simply absent.
 */
export async function resolvePublicNames(
  ids: readonly number[],
  fetchImpl: typeof fetch = fetch
): Promise<Map<number, string>> {
  try {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    return await withinBudget(postNames(unique, fetchImpl), new Map<number, string>());
  } catch {
    return new Map();
  }
}
