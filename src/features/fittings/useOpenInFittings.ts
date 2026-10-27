import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type EditLocation = { pathname: string; search: string };

export interface OpenInFittings {
  open: (location: () => Promise<EditLocation | null>) => void;
  /** A location is loading: the caller shows it (a `Button`'s `loading`, a row spinner). */
  pending: boolean;
}

/**
 * Open in Fittings for an Assets ship, whose location can take a few seconds
 * (it waits on ESI for the ship's abyssal rolls): `pending` while it loads,
 * so the press gets feedback; a second press meanwhile does nothing, and a
 * page left in the meantime stays left.
 */
export function useOpenInFittings(): OpenInFittings {
  const navigate = useNavigate();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const open = useCallback(
    (location: () => Promise<EditLocation | null>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      void location()
        .then((found) => {
          if (found && mounted.current) void navigate(found);
        })
        .finally(() => {
          inFlight.current = false;
          if (mounted.current) setPending(false);
        });
    },
    [navigate]
  );
  return { open, pending };
}
