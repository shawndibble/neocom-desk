/**
 * The Appraisal tab's state, held at route level rather than inside
 * `AppraisalPanel`.
 *
 * Two things follow from that, and both are the reason it is a hook:
 *
 * - **A pasted list survives a tab switch.** `Market.tsx` renders the panel
 *   behind `section === 'appraisal'`, so the component unmounts the moment
 *   you look at the Browser. Losing a forty-line paste to a misclick is not
 *   a state anyone would design on purpose.
 * - **The page header can drive it.** The Appraisal tab shares the Market
 *   page's trade-hub picker and refresh button, so the header needs to know
 *   whether there is anything to re-price and whether a re-price is already
 *   in flight.
 *
 * The text in the box and the text that was appraised are separate: typing
 * does not re-price, pressing Appraise does. Once a result exists, changing
 * the hub or the percentage re-prices on its own — the percentage is pure
 * arithmetic and the hub's prices are usually already cached, so making the
 * pilot press the button again to see a number that has already changed
 * would just be a stale screen with a button on it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TradeHub } from '@/market/hubs';
import {
  appraisePaste,
  compareHubs,
  type AppraisalOutcome,
  type HubComparisonRow,
} from './appraisalData';

export interface AppraisalController {
  /** What is in the box. */
  text: string;
  setText: (next: string) => void;
  /**
   * Sets the text and submits it in one call, rather than `setText` followed
   * by `appraise()` — `appraise` closes over `text`, so a caller submitting a
   * value it just computed (not one the pilot typed) needs the value applied
   * directly instead of racing the state update.
   */
  appraiseText: (next: string) => void;
  /** Null until the first Appraise, and again after Clear. */
  result: AppraisalOutcome | null;
  /** The same pile priced at all 5 Trade Hubs. Null and set together with `result`. */
  compare: HubComparisonRow[] | null;
  loading: boolean;
  /** The catalogue could not be loaded; the paste itself is untouched. */
  failed: boolean;
  /** True when there is text to appraise. */
  canAppraise: boolean;
  appraise: () => void;
  clear: () => void;
  /** Re-price the current list, bypassing the price cache. */
  refresh: () => void;
}

export function useAppraisal(
  hub: TradeHub,
  pricePercent: number,
  characterId: number | null
): AppraisalController {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [result, setResult] = useState<AppraisalOutcome | null>(null);
  const [compare, setCompare] = useState<HubComparisonRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Bumped by the refresh button only. Part of the effect's dependencies so a
  // second press re-runs it even though nothing else changed.
  const [forceTick, setForceTick] = useState(0);
  // Whether the run the effect is about to start was asked for by refresh.
  // A ref, not state: it must not itself trigger the effect.
  const forced = useRef(false);

  useEffect(() => {
    // Nothing submitted yet, or `clear` just reset it — and `clear` resets the
    // result itself rather than letting this effect do it, so that an empty
    // `submitted` never has to write state from inside an effect body.
    if (submitted.trim() === '') return;

    const force = forced.current;
    forced.current = false;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const [outcome, compareRows] = await Promise.all([
          appraisePaste(submitted, hub, pricePercent, characterId, { force }),
          compareHubs(submitted, pricePercent, { force }),
        ]);
        if (cancelled) return;
        setResult(outcome);
        setCompare(compareRows);
      } catch {
        // Only the catalogue load throws; prices degrade to nulls in place.
        if (cancelled) return;
        setResult(null);
        setCompare(null);
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [submitted, hub, pricePercent, characterId, forceTick]);

  const appraiseText = useCallback((next: string) => {
    setText(next);
    // Guarded rather than left to the effect: an empty submit would otherwise
    // leave the previous result on screen with nothing backing it.
    if (next.trim() === '') return;
    setSubmitted(next);
    // Re-submitting the same text unchanged must still re-run, or the
    // button does nothing after a failure.
    setForceTick((tick) => tick + 1);
  }, []);

  // `setText(text)` here is a no-op re-set of the value it already holds.
  const appraise = useCallback(() => appraiseText(text), [text, appraiseText]);

  const clear = useCallback(() => {
    setText('');
    setSubmitted('');
    setResult(null);
    setCompare(null);
    setLoading(false);
    setFailed(false);
  }, []);

  const refresh = useCallback(() => {
    forced.current = true;
    setForceTick((tick) => tick + 1);
  }, []);

  return {
    text,
    setText,
    appraiseText,
    result,
    compare,
    loading,
    failed,
    canAppraise: text.trim() !== '',
    appraise,
    clear,
    refresh,
  };
}
