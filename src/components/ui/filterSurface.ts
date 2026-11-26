import { createContext, useContext } from 'react';

export type FilterSurface = 'inline' | 'sheet';

export const FilterSurfaceContext = createContext<FilterSurface>('inline');

export function useFilterSurface(): FilterSurface {
  return useContext(FilterSurfaceContext);
}
