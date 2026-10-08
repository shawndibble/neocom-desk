import { createContext } from 'react';

/** Opens the Make it fit dialog; null on surfaces that can't edit the Fitting. */
export const MakeItFitContext = createContext<(() => void) | null>(null);
