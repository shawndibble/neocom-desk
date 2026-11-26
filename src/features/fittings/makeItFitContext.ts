import { createContext } from 'react';

export type FitResource = 'cpu' | 'powergrid' | 'calibration';

export const MakeItFitContext = createContext<((resource: FitResource) => void) | null>(null);
