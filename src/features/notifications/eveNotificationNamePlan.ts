import type { parseEveNotificationPayload } from '@/engine/eveNotificationPayload';
import { orbitalAggressorId } from './eveNotificationRender';

export function entityIdsToResolve(
  type: string,
  payload: ReturnType<typeof parseEveNotificationPayload>
): number[] {
  switch (type) {
    case 'CorpAppNewMsg':
      return payload.charId === undefined ? [] : [payload.charId];
    case 'WarDeclared':
    case 'AllWarDeclaredMsg':
      return payload.declaredById === undefined ? [] : [payload.declaredById];
    case 'StructureUnderAttack':
      if (payload.corpName !== undefined || payload.allianceName !== undefined) return [];
      return payload.charId === undefined ? [] : [payload.charId];
    case 'CorpKicked':
      return payload.corpId === undefined ? [] : [payload.corpId];
    case 'OrbitalAttacked': {
      const id = orbitalAggressorId(payload);
      return id === undefined ? [] : [id];
    }
    default:
      return [];
  }
}

export const RESOLUTION_BUDGET_MS = 3_000;

export async function withinBudget<T>(
  work: Promise<T>,
  fallback: T,
  budgetMs: number = RESOLUTION_BUDGET_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), budgetMs);
  });
  try {
    return await Promise.race([work.catch(() => fallback), expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
