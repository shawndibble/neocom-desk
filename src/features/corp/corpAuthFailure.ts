import { EsiError, isAuthFailure } from '@/esi/client';

export function isCorpRoleGate(err: unknown): boolean {
  return err instanceof EsiError && err.status === 403;
}

export function detectCorpAuthFailure(err: unknown): boolean {
  return isAuthFailure(err) && !isCorpRoleGate(err);
}
