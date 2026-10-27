import { useContext } from 'react';
import { BookContext, type BookContextValue } from './bookContextValue';

export function useBook(): BookContextValue {
  const ctx = useContext(BookContext);
  if (!ctx) throw new Error('useBook outside a BookProvider');
  return ctx;
}

/** The message a callable error carries, for a dialog's error line. */
export function editErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
