import { createContext, useContext } from 'react';

export type FilterSurface = 'inline' | 'sheet';

export const FilterSurfaceContext = createContext<FilterSurface>('inline');

/**
 * Where the control currently being rendered lives — a `FilterBar`'s toolbar
 * row, or its mobile sheet. `FilterField` is the intended reader; it exists so
 * a control can carry a visible caption in the sheet, where it stands alone,
 * without one crowding the row, where its neighbours give it context.
 *
 * Its own module rather than `FilterBar.tsx` so that file exports components
 * only, which is what keeps Fast Refresh working for it.
 */
export function useFilterSurface(): FilterSurface {
  return useContext(FilterSurfaceContext);
}
