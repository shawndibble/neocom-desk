/**
 * The Implants & Boosters editor's open state, kept in the URL (`?implants=1`;
 * the Pilot panel that hosts its control opens itself for it). A link out of the editor —
 * the market, an LP Store — is a normal navigation, so Back lands on the same
 * Fitting with the editor open again instead of a page that forgot it. Opening
 * pushes one history entry; closing pops that entry (or just clears the param
 * when the editor was opened by a pasted link).
 */
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { boolParam, nullableTextParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';

export const IMPLANT_GOAL_PARAM = 'implantGoal';
/** The editor's other view state; all of it goes when the editor closes. */
const VIEW_PARAMS = ['implantSlot', 'implantQuery', 'implantSort', 'implantTab'] as const;

interface ModalState {
  implantsPushed?: boolean;
}

export function useImplantsModalUrl(param: 'implants') {
  const schema = useMemo(
    () => ({
      [param]: boolParam(false),
      [IMPLANT_GOAL_PARAM]: nullableTextParam(),
      ...Object.fromEntries(VIEW_PARAMS.map((key) => [key, nullableTextParam()])),
    }),
    [param]
  );
  const [values, setValues] = useUrlParams(schema);
  const location = useLocation();
  const navigate = useNavigate();
  const open = (values as Record<string, unknown>)[param] === true;
  const pushed = (location.state as ModalState | null)?.implantsPushed === true;

  const openModal = useCallback(
    () =>
      setValues({ [param]: true } as never, {
        push: true,
        state: { ...(location.state as object | null), implantsPushed: true },
      }),
    [param, setValues, location.state]
  );
  const closeModal = useCallback(() => {
    if (pushed) {
      navigate(-1);
      return;
    }
    setValues({
      [param]: false,
      [IMPLANT_GOAL_PARAM]: null,
      ...Object.fromEntries(VIEW_PARAMS.map((key) => [key, null])),
    } as never);
  }, [pushed, navigate, setValues, param]);

  return { open, openModal, closeModal };
}
