import { useEffect, useMemo } from 'react';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { useOreRefiningStructureRate } from '@/features/assets/oreDecision/refiningFacility';
import { resolveRefiningSetup, type RefiningSetup } from '@/engine/industry/refiningSetup';

export const REPROCESSING_TAX_RATE_KEY = 'sync.reprocessingTaxRate';

export const useReprocessingTaxRate = createSyncedSetting<number>({
  key: REPROCESSING_TAX_RATE_KEY,
  defaultValue: 0,
  parse: (raw) =>
    typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null,
});

export interface RefiningSetupControls {
  setup: RefiningSetup;
  hydrated: boolean;
  setYieldRate: (fraction: number) => Promise<void>;
  setTaxRate: (fraction: number) => Promise<void>;
}

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
