import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

type EditLocation = { pathname: string; search: string };

/**
 * Open in Fittings for an Assets ship, whose location can take a few seconds
 * (it waits on ESI for the ship's abyssal rolls): a second click while one
 * is loading does nothing, and a page left in the meantime stays left.
 */
export function useOpenInFittings(): (location: () => Promise<EditLocation | null>) => void {
  const navigate = useNavigate();
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(
    (location) => {
      if (pending.current) return;
      pending.current = true;
      void location()
        .then((found) => {
          if (found && mounted.current) void navigate(found);
        })
        .finally(() => {
          pending.current = false;
        });
    },
    [navigate]
  );
}
