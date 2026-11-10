/**
 * The Implants & Boosters editor's open state, kept in the URL (`?implants=1`;
 * the Pilot panel that hosts its control opens itself for it). A link out of the editor —
 * the market, an LP Store — is a normal navigation, so Back lands on the same
 * Fitting with the editor open again instead of a page that forgot it. Opening
 * pushes one history entry, so Back closes it; closing never goes Back, it clears
 * the param, so the Fitting under the editor stays as it is.
 */
import { useCallback, useMemo } from 'react';
import { boolParam, nullableTextParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';

export const IMPLANT_GOAL_PARAM = 'implantGoal';
/** The editor's other view state; all of it goes when the editor closes. */
const VIEW_PARAMS = ['implantSlot', 'implantQuery', 'implantSort', 'implantTab'] as const;

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
  const open = (values as Record<string, unknown>)[param] === true;

  const openModal = useCallback(
    () => setValues({ [param]: true } as never, { push: true }),
    [param, setValues]
  );
  const closeModal = useCallback(() => {
    setValues({
      [param]: false,
      [IMPLANT_GOAL_PARAM]: null,
      ...Object.fromEntries(VIEW_PARAMS.map((key) => [key, null])),
    } as never);
  }, [setValues, param]);

  return { open, openModal, closeModal };
}
