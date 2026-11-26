import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type EditLocation = { pathname: string; search: string };

export interface OpenInFittings {
  open: (location: () => Promise<EditLocation | null>) => void;
  pending: boolean;
}

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
