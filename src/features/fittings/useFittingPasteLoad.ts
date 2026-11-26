import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { FittingLoadState } from '@/lib/shortcuts';
import type { FittingWorkspace } from './useFittingWorkspace';

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
