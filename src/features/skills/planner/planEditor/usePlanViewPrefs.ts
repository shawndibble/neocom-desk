import { useHydratedStore } from '@/lib/useHydratedStore';
import { useColumnVisibility } from '../columnPreference';
import { useGroupingMode } from '../groupingMode';

export function usePlanViewPrefs() {
  const columnVisibility = useColumnVisibility((state) => state.value);
  const setColumnVisibility = useColumnVisibility((state) => state.setValue);
  useHydratedStore(useColumnVisibility);

  const groupingMode = useGroupingMode((state) => state.value);
  const setGroupingMode = useGroupingMode((state) => state.setValue);
  useHydratedStore(useGroupingMode);
  return { columnVisibility, setColumnVisibility, groupingMode, setGroupingMode };
}
