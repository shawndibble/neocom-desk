/**
 * What counts as "log in again" on a corp read (issue #298).
 *
 * Every other data module takes `esi/cache.ts`'s default, `isAuthFailure`,
 * which calls both 401 and 403 an auth failure and so raises a `ReauthBanner`.
 * That reading is wrong for corp endpoints and only for corp endpoints: CCP
 * gates them on in-game roles server-side, so their 403 is a permission the
 * user cannot grant and re-authing cannot change. Painting a login button over
 * it is the `ReauthBanner`-over-a-403 failure `ScopeGate.tsx` warns about, made
 * routine — and the corp surfaces hide rather than lock precisely to avoid it
 * (CONTEXT.md round 35).
 *
 * So: the role gate is subtracted, and everything the shared rule would still
 * have called an auth failure — a 401, or a token refresh that itself failed —
 * stays one. A 403 falls through to the ordinary offline path instead: cache,
 * then an empty state.
 */
import { EsiError, isAuthFailure } from '@/esi/client';

/** A 403 from a corp endpoint: the in-game role gate, not a scope problem. */
export function isCorpRoleGate(err: unknown): boolean {
  return err instanceof EsiError && err.status === 403;
}

/** `detectAuthFailure` for every corp read — the shared rule, minus the role gate. */
export function detectCorpAuthFailure(err: unknown): boolean {
  return isAuthFailure(err) && !isCorpRoleGate(err);
}
