import { useEffect, useState, type ReactNode } from 'react';
import { BootScreen } from './BootScreen';
import { bootUpdateMayHold, type BootUpdateOutcome } from './bootUpdate';
import { bootUpdateOnce } from './bootUpdateOnce';

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
