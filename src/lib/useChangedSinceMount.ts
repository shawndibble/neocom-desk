import { useState } from 'react';

export function useChangedSinceMount<T>(value: T): boolean {
  const [initial] = useState(value);
  const [changed, setChanged] = useState(false);
  if (!changed && !Object.is(value, initial)) setChanged(true);
  return changed;
}
