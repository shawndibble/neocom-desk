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
  /** Runs one edit action and reloads the book. Rejects with the server's message. */
  edit: <Out = Record<string, unknown>>(
    action: { action: string } & Record<string, unknown>
  ) => Promise<Out>;
}

export const BookContext = createContext<BookContextValue | null>(null);
