import { createContext } from 'react';

export const SourceNames = createContext<{
  hubName: (hubId: string) => string;
  itemName: (typeId: number) => string;
}>({ hubName: (id) => id, itemName: (id) => `#${id}` });
