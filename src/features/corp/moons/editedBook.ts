/**
 * The Corp Tax Book this device last opened as an editor, and the corporations
 * already on it as moon owners (issue #6103). Remembered so "Finish setting up"
 * can offer a CEO's corporation for the book after a sign-in without opening the
 * book (a verified, priced Firestore read) or prompting for anything. Device-local
 * and advisory: the server re-checks the editor and the corporation on connect.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const EDITED_BOOK_KEY = 'moonsEditedBook';

export interface EditedBook {
  collectorCorporationId: number;
  editorCharacterId: number;
  /** Corporations on the book in any live way; never offered again. */
  onBook: number[];
}

const isId = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

export function parseEditedBook(raw: unknown): EditedBook | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
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

/** Remember the book, writing only when it changed (the Moons page re-renders often). */
export async function rememberEditedBook(book: EditedBook): Promise<void> {
  const store = useEditedBookStore.getState();
  if (!store.hydrated) await store.hydrate();
  const now = useEditedBookStore.getState().value;
  const sorted = { ...book, onBook: [...book.onBook].sort((a, b) => a - b) };
  if (JSON.stringify(now) === JSON.stringify(sorted)) return;
  await useEditedBookStore.getState().setValue(sorted);
}
