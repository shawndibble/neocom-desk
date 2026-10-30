import { useHydratedStore } from '@/lib/useHydratedStore';
import { useColumnVisibility } from '../columnPreference';
import { useGroupingMode } from '../groupingMode';

/** The entry list's two device-local view preferences: Columns and Group-by. */
export function usePlanViewPrefs() {
  // "Columns" control (#114): a device-local view preference, applying the
  // same way across every plan on this device rather than per-plan.
  const columnVisibility = useColumnVisibility((state) => state.value);
  const setColumnVisibility = useColumnVisibility((state) => state.setValue);
  useHydratedStore(useColumnVisibility);

  // Grouping toggle (#115): priority (default) or attribute-pair band
  // headers — visual only, same device-local preference shape as Columns.
  const groupingMode = useGroupingMode((state) => state.value);
  const setGroupingMode = useGroupingMode((state) => state.setValue);
  useHydratedStore(useGroupingMode);
  return { columnVisibility, setColumnVisibility, groupingMode, setGroupingMode };
}
