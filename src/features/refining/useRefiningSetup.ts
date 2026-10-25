/**
 * The pilot's Refining Setup in the UI: the Facility Yield and Reprocessing
 * Tax they typed, resolved into the `RefiningSetup` every refining figure
 * reads (docs/context/decisions/…-refining-setup-…). Both are synced,
 * player-entered data: ESI cannot read a facility's rate or fee.
 */
import { useEffect, useMemo } from 'react';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { useOreRefiningStructureRate } from '@/features/assets/oreDecision/refiningFacility';
import { resolveRefiningSetup, type RefiningSetup } from '@/engine/industry/refiningSetup';

export const REPROCESSING_TAX_RATE_KEY = 'sync.reprocessingTaxRate';

/** A fraction of the refined value (0.01 = 1%); 0 = no tax. */
export const useReprocessingTaxRate = createSyncedSetting<number>({
  key: REPROCESSING_TAX_RATE_KEY,
  defaultValue: 0,
  parse: (raw) =>
    typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null,
});

export interface RefiningSetupControls {
  /** What the engines read. */
  setup: RefiningSetup;
  /** True once both stored values are read, so a first paint is not the 50% default. */
  hydrated: boolean;
  setYieldRate: (fraction: number) => Promise<void>;
  setTaxRate: (fraction: number) => Promise<void>;
}

/** The pilot's Refining Setup, hydrated, with the two setters. */
export function useRefiningSetup(): RefiningSetupControls {
  const yieldRate = useOreRefiningStructureRate((s) => s.value);
  const yieldHydrated = useOreRefiningStructureRate((s) => s.hydrated);
  const setYieldRate = useOreRefiningStructureRate((s) => s.setValue);
  const taxRate = useReprocessingTaxRate((s) => s.value);
  const taxHydrated = useReprocessingTaxRate((s) => s.hydrated);
  const setTaxRate = useReprocessingTaxRate((s) => s.setValue);

  useEffect(() => {
    void useOreRefiningStructureRate.getState().hydrate();
    void useReprocessingTaxRate.getState().hydrate();
  }, []);

  const setup = useMemo(() => resolveRefiningSetup({ yieldRate, taxRate }), [yieldRate, taxRate]);
  return { setup, hydrated: yieldHydrated && taxHydrated, setYieldRate, setTaxRate };
}
