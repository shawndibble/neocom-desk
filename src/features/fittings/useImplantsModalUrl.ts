/**
 * The Implants & Boosters editor's open state, kept in the URL (`?implants=1`,
 * or the Improve panel's own `?improveImplants=1`). A link out of the editor —
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

interface ModalState {
  implantsPushed?: boolean;
}

export function useImplantsModalUrl(param: 'implants' | 'improveImplants') {
  const schema = useMemo(
    () => ({ [param]: boolParam(false), [IMPLANT_GOAL_PARAM]: nullableTextParam() }),
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
    setValues({ [param]: false, [IMPLANT_GOAL_PARAM]: null } as never);
  }, [pushed, navigate, setValues, param]);

  return { open, openModal, closeModal };
}
