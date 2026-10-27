/**
 * Keeps a plan's security band agreeing with the system its job runs in.
 *
 * The band stopped being a field when it became derivable — but only edits
 * derived it, which left three ways for a stored band to be wrong with no
 * control left to correct it: a plan saved before the field went away, a plan
 * whose hub changed while it names no build system, and a new plan that
 * inherits its band from whichever plan was edited last (`Industry.tsx`).
 * `computeBuildPlan` still feeds that band to the 1x/1.9x/2.1x rig multiplier,
 * so a wrong one is wrong ISK, silently.
 *
 * Reconciled on load rather than migrated in Dexie: the band comes from ESI,
 * and a migration that has to reach the network is a migration that fails
 * offline. Here a failed lookup simply leaves the plan alone until next time.
 */
import { useEffect } from 'react';
import { securityBand, type SecurityBand } from '@/engine/securityStatus';
import { loadSystemSecurity } from '@/features/character/systemSecurity';

export function useDerivedSecurityBand(
  buildSystemId: number | undefined,
  hubSecurity: SecurityBand,
  stored: SecurityBand,
  onCorrect: (security: SecurityBand) => void
): void {
  useEffect(() => {
    let cancelled = false;
    // No build system means the job runs at the hub, whose band is a constant
    // — no request, and it settles the legacy case immediately.
    if (buildSystemId === undefined) {
      if (stored !== hubSecurity) onCorrect(hubSecurity);
      return;
    }
    void loadSystemSecurity(buildSystemId).then((status) => {
      if (cancelled || status === null) return;
      const derived = securityBand(status);
      if (derived !== stored) onCorrect(derived);
    });
    return () => {
      cancelled = true;
    };
    // `onCorrect` is a fresh closure each render and would re-fire this every
    // commit; the plan fields are what actually decide whether to correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildSystemId, hubSecurity, stored]);
}
