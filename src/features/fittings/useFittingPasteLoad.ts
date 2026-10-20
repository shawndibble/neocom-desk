import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { FittingLoadState } from '@/lib/shortcuts';
import type { FittingWorkspace } from './useFittingWorkspace';

/**
 * The app-wide paste router (`app/GlobalPasteRouter.tsx`) lands here with
 * a pasted EFT fit to open. Keyed on the navigation itself so a re-render
 * never re-loads it, and the state is cleared once read: unlike appraising,
 * loading opens the editor, so a remount on this entry (Back from another
 * section) must not open the fit all over again. The editor replaces this
 * landing entry rather than pushing past it, so one Back undoes the paste.
 */
export function useFittingPasteLoad(loadFromInput: FittingWorkspace['loadFromInput']): void {
  const navigate = useNavigate();
  const location = useLocation();
  const handledLoadKey = useRef<string | null>(null);
  useEffect(() => {
    const text = (location.state as Partial<FittingLoadState> | null)?.fittingLoadText;
    if (!text || handledLoadKey.current === location.key) return;
    handledLoadKey.current = location.key;
    void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    void loadFromInput(text, { replaceEntry: true });
  }, [location.key, location.state, location.pathname, location.search, navigate, loadFromInput]);
}
