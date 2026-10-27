import { createContext } from 'react';

/** A budget Make it fit can bring a Fitting back under. */
export type FitResource = 'cpu' | 'powergrid' | 'calibration';

/** Opens the Make it fit dialog from that budget's "Fix" link; null on surfaces that can't edit the Fitting. */
export const MakeItFitContext = createContext<((resource: FitResource) => void) | null>(null);
