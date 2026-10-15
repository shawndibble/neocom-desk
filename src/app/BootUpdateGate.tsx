import { useEffect, useState, type ReactNode } from 'react';
import { BootScreen } from './BootScreen';
import { bootUpdateMayHold, type BootUpdateOutcome } from './bootUpdate';
import { bootUpdateOnce } from './bootUpdateOnce';

/**
 * Holds the app behind the boot screen while a waiting build is applied
 * (`bootUpdate.ts`). Renders the children on any outcome except `'applying'`,
 * where the page is about to reload and the boot screen stays up.
 */
export function BootUpdateGate({ children }: { children: ReactNode }) {
  const [outcome, setOutcome] = useState<BootUpdateOutcome | null>(() =>
    bootUpdateMayHold() ? null : 'current'
  );

  useEffect(() => {
    let live = true;
    void bootUpdateOnce().then((result) => {
      if (live) setOutcome(result);
    });
    return () => {
      live = false;
    };
  }, []);

  if (outcome === null || outcome === 'applying') return <BootScreen />;
  return <>{children}</>;
}
