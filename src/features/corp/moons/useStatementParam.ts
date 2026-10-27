import { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * The `?statement=<id>` that opens a Statement panel. Opening pushes an entry; closing replaces it,
 * so Back leaves the page instead of reopening the panel. Other query params are kept.
 * An id the page does not hold (`ready`, but not `known`) is dropped with a replace and
 * leaves `notFound` to say so.
 */
export function useStatementParam(ready: boolean, isKnown: (id: string) => boolean) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const openId = params.get('statement');
  const known = openId !== null && ready && isKnown(openId);
  const set = (id: string | null, options: { replace: boolean; notFound?: boolean }) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id === null) next.delete('statement');
        else next.set('statement', id);
        return next;
      },
      {
        replace: options.replace,
        ...(options.notFound ? { state: { statementNotFound: true } } : {}),
      }
    );
  const drop = openId !== null && ready && !known;
  useEffect(() => {
    if (drop) set(null, { replace: true, notFound: true });
    // `set` only closes over setParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drop]);
  const notFound = (location.state as { statementNotFound?: boolean } | null)?.statementNotFound
    ? t('corpTaxBook.moons.statementPeriod.statementNotFound')
    : null;
  return {
    /** The id to open, only when the page holds it. */
    openId: known ? openId : null,
    selectedId: openId,
    open: (id: string) => set(id, { replace: false }),
    close: () => set(null, { replace: true }),
    notFound,
  };
}
