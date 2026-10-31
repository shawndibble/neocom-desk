import { createContext } from 'react';
import type { BookView } from '@/engine/corpTaxBook/bookView';
import type { BookData, BookSettings, OfficerVerdict } from '../taxBook/bookClient';
import type { BookNames } from './useCorpBook';

export interface BookContextValue {
  characterId: number;
  corporationId: number;
  view: BookView;
  names: BookNames;
  settings: BookSettings;
  data: BookData;
  verdict: OfficerVerdict;
  canEdit: boolean;
  reload: () => void;
  /**
   * Asks for the ledger rows on a tab that opened without them (Moon owners). A dialog that
   * prices from rows calls it, then waits for `data.parts` to hold `observed`.
   */
  requestRows?: () => void;
  /** Runs one edit action and reloads the book. Rejects with the server's message. */
  edit: <Out = Record<string, unknown>>(
    action: { action: string } & Record<string, unknown>
  ) => Promise<Out>;
}

export const BookContext = createContext<BookContextValue | null>(null);
