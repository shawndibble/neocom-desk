import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { decodeAppraisalList, encodeAppraisalList } from '@/engine/market/appraisalListCode';
import type { AppraisalController } from './useAppraisal';

export const APPRAISAL_LIST_PARAM = 'list';

export function useAppraisalListUrl(
  appraisal: Pick<AppraisalController, 'submitted' | 'text' | 'appraiseText'>,
  active: boolean
): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const listParam = searchParams.get(APPRAISAL_LIST_PARAM);
  const { submitted, text, appraiseText } = appraisal;

  const latest = useRef({ submitted, text, appraiseText, searchParams, setSearchParams });
  useEffect(() => {
    latest.current = { submitted, text, appraiseText, searchParams, setSearchParams };
  });
  const setList = (code: string | null) => {
    const { searchParams: current, setSearchParams: set } = latest.current;
    if (current.get(APPRAISAL_LIST_PARAM) === code) return;
    const next = new URLSearchParams(current);
    if (code === null) next.delete(APPRAISAL_LIST_PARAM);
    else next.set(APPRAISAL_LIST_PARAM, code);
    set(next, { replace: true });
  };

  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (listParam === null || handled.current === listParam) return;
    handled.current = listParam;
    const { submitted: now, text: typed } = latest.current;
    const idle = now === '' && typed.trim() === '';
    void decodeAppraisalList(listParam).then((result) => {
      if (!result.ok) setList(null);
      else if (idle && latest.current.submitted === '' && latest.current.text.trim() === '')
        latest.current.appraiseText(result.text);
    });
  }, [listParam]);

  const previous = useRef('');
  useEffect(() => {
    const before = previous.current;
    previous.current = submitted;
    if (!active) return;
    if (submitted === '') {
      if (before !== '') setList(null);
      return;
    }
    let cancelled = false;
    void encodeAppraisalList(submitted).then((result) => {
      if (!cancelled) setList(result.ok ? result.code : null);
    });
    return () => {
      cancelled = true;
    };
  }, [submitted, active]);
}
