import { isId, isRecord } from '@/engine/guards';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const EDITED_BOOK_KEY = 'moonsEditedBook';

export interface EditedBook {
  collectorCorporationId: number;
  editorCharacterId: number;
  onBook: number[];
}

export function parseEditedBook(raw: unknown): EditedBook | null {
  if (!isRecord(raw)) return null;
  const r = raw;
  if (!isId(r.collectorCorporationId) || !isId(r.editorCharacterId)) return null;
  return {
    collectorCorporationId: r.collectorCorporationId,
    editorCharacterId: r.editorCharacterId,
    onBook: Array.isArray(r.onBook) ? r.onBook.filter(isId) : [],
  };
}

export const useEditedBookStore = createLocalSetting<EditedBook | null>({
  key: EDITED_BOOK_KEY,
  defaultValue: null,
  parse: parseEditedBook,
});

export async function rememberEditedBook(book: EditedBook): Promise<void> {
  const store = useEditedBookStore.getState();
  if (!store.hydrated) await store.hydrate();
  const now = useEditedBookStore.getState().value;
  const sorted = { ...book, onBook: [...book.onBook].sort((a, b) => a - b) };
  if (JSON.stringify(now) === JSON.stringify(sorted)) return;
  await useEditedBookStore.getState().setValue(sorted);
}
