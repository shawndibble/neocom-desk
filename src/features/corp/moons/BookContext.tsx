/**
 * What every `/corp/moons` component needs from the ready book, so the tabs
 * and dialogs take few props: the joined view, names, who the viewer is, and
 * `edit` — one action through `editBook` (ADR 0023), then a reload.
 */
import { useCallback, useMemo, type ReactNode } from 'react';
import { editBook } from '../taxBook/bookClient';
import { BookContext, type BookContextValue } from './bookContextValue';

export function BookProvider({
  value,
  children,
}: {
  value: Omit<BookContextValue, 'edit' | 'canEdit'>;
  children: ReactNode;
}) {
  const { characterId, corporationId, reload, verdict } = value;
  const edit = useCallback(
    async <Out,>(action: { action: string } & Record<string, unknown>) => {
      try {
        return await editBook<Out>(characterId, corporationId, action);
      } finally {
        // Even a refused edit may have changed what is on screen (a stale view).
        reload();
      }
    },
    [characterId, corporationId, reload]
  );
  const merged = useMemo(
    () => ({ ...value, edit, canEdit: verdict.canEdit }),
    [value, edit, verdict.canEdit]
  );
  return <BookContext.Provider value={merged}>{children}</BookContext.Provider>;
}
