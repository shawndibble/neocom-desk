import { useCallback, useMemo } from 'react';
import { boolParam, nullableTextParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';

export const IMPLANT_GOAL_PARAM = 'implantGoal';
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
