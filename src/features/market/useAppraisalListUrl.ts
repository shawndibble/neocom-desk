/**
 * Keeps the appraised list in the address as `?list=<code>` (#5403), per the
 * "URL holds view state" rule (ADR 0015): Back, Forward, a reload and a
 * copied address all show the Appraisal that was on screen.
 *
 * - **Written** (replace, not push) whenever a list is submitted; Clear
 *   removes it. Typing in the box alone never touches the URL.
 * - **Read** once per `list` value, only while nothing has been typed or
 *   appraised yet this visit, so arriving via Back never overwrites a list
 *   the pilot has since worked on. It then appraises exactly as Appraise does.
 * - A code that fails to decode is stripped and ignored, no error.
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
  appraisal: Pick<AppraisalController, 'submitted' | 'text' | 'appraiseText'>
): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const listParam = searchParams.get(APPRAISAL_LIST_PARAM);
  const { submitted, text, appraiseText } = appraisal;

  const latest = useRef({ submitted, text, appraiseText });
  useEffect(() => {
    latest.current = { submitted, text, appraiseText };
  });

  const setList = (code: string | null) =>
    setSearchParams(
      (prev) => {
        if (prev.get(APPRAISAL_LIST_PARAM) === code) return prev;
        const next = new URLSearchParams(prev);
        if (code === null) next.delete(APPRAISAL_LIST_PARAM);
        else next.set(APPRAISAL_LIST_PARAM, code);
        return next;
      },
      { replace: true }
    );
  const setListRef = useRef(setList);
  useEffect(() => {
    setListRef.current = setList;
  });

  // Read on arrival.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (listParam === null || handled.current === listParam) return;
    handled.current = listParam;
    const { submitted: now, text: typed } = latest.current;
    if (now !== '' || typed.trim() !== '') return;
    void decodeAppraisalList(listParam).then((result) => {
      if (!result.ok) setListRef.current(null);
      else if (latest.current.submitted === '' && latest.current.text.trim() === '')
        latest.current.appraiseText(result.text);
    });
  }, [listParam]);

  // Write on submit and on Clear.
  const previous = useRef('');
  useEffect(() => {
    const before = previous.current;
    previous.current = submitted;
    if (submitted === '') {
      if (before !== '') setListRef.current(null);
      return;
    }
    let cancelled = false;
    void encodeAppraisalList(submitted).then((result) => {
      if (!cancelled) setListRef.current(result.ok ? result.code : null);
    });
    return () => {
      cancelled = true;
    };
  }, [submitted]);
}
