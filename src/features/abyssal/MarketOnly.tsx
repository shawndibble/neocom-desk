import type { ReactNode } from 'react';
import { useIsAbyssalType } from './mutaplasmidData';

export function MarketOnly({ typeId, children }: { typeId: number; children: ReactNode }) {
  return useIsAbyssalType(typeId) === true ? null : children;
}
