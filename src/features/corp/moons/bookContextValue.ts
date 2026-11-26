import { createContext } from 'react';
import type { BookView } from '@/engine/corpTaxBook/bookView';
import type { BookData, BookSettings, OfficerVerdict } from '../taxBook/bookClient';
import type { MoonDoc } from '../../../../functions/src/corpTaxBookMoonDocs';
import type { SettingsTab } from './moonsPaths';
import type { BookNames } from './useCorpBook';

export interface BookContextValue {
  characterId: number;
  corporationId: number;
  view: BookView;
  names: BookNames;
  settings: BookSettings;
  data: BookData;
  refinery?: { structureId: number; docs: ReadonlyMap<string, MoonDoc> };
  verdict: OfficerVerdict;
  canEdit: boolean;
  reload: () => void;
  requestRows?: () => void;
  openSettings?: (tab?: SettingsTab) => void;
  edit: <Out = Record<string, unknown>>(
    action: { action: string } & Record<string, unknown>
  ) => Promise<Out>;
}

export const BookContext = createContext<BookContextValue | null>(null);
