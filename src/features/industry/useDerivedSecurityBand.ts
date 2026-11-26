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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildSystemId, hubSecurity, stored]);
}
