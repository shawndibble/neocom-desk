/**
 * Keeps the appraised list in the address as `?list=<code>` (#5403), per the
 * "URL holds view state" rule (ADR 0015). Its codec is async, so it does not
 * go through `lib/urlState.ts`.
 *
 * - **Written** (replace, not push) whenever a list is submitted while the
 *   Appraisal tab is showing; Clear removes it. Typing alone never writes.
 * - **Read** once per `list` value. It appraises only while nothing has been
 *   typed or appraised yet this visit, so arriving via Back never overwrites
 *   the pilot's work. A code that fails to decode is stripped either way.
 * - A list too long to encode is not written; the Appraisal works from memory
 *   and this is the one case Back will not restore. A stale `list` from an
 *   earlier, shorter paste is removed so Back never shows a different list.
 */
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

  // An async write must patch the params as last rendered, not the ones this
  // render closed over: `?share=` is stripped in the same tick by its own hook.
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
