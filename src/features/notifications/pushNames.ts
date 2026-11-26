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
