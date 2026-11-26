import { useCallback, useEffect, useRef, useState } from 'react';
import type { TradeHub } from '@/market/hubs';
import {
  appraisePaste,
  compareHubs,
  type AppraisalOutcome,
  type HubComparisonRow,
} from './appraisalData';
import { addRecent, useRecentAppraisals } from './appraisalRecent';
import { useAppraisalLive, type LiveProgress } from './useAppraisalLive';
import { DEFAULT_REFINING_SETUP, type RefiningSetup } from '@/engine/industry/refiningSetup';

export interface AppraisalController {
  text: string;
  setText: (next: string) => void;
  appraiseText: (next: string) => void;
  submitted: string;
  quantityColumn: number | null;
  chooseQuantityColumn: (column: number) => void;
  result: AppraisalOutcome | null;
  compare: HubComparisonRow[] | null;
  loading: boolean;
  failed: boolean;
  canAppraise: boolean;
  appraise: () => void;
  clear: () => void;
  refresh: () => void;
  live: LiveProgress;
  compareLive: LiveProgress;
  setCompareOpen: (open: boolean) => void;
  settleLive: () => Promise<AppraisalOutcome | null>;
}

export function useAppraisal(
  hub: TradeHub,
  pricePercent: number,
  characterId: number | null,
  refining: RefiningSetup = DEFAULT_REFINING_SETUP,
  refiningReady = true
): AppraisalController {
  const { stationRate, taxRate } = refining;
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [pick, setPick] = useState<{ text: string; column: number } | null>(null);
  const quantityColumn = pick !== null && pick.text === submitted ? pick.column : null;
  const [base, setBase] = useState<AppraisalOutcome | null>(null);
  const [baseCompare, setBaseCompare] = useState<HubComparisonRow[] | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [forceTick, setForceTick] = useState(0);
  const forced = useRef(false);

  useEffect(() => {
    if (submitted.trim() === '' || !refiningReady) return;

    const force = forced.current;
    forced.current = false;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const [outcome, compareRows] = await Promise.all([
          appraisePaste(submitted, hub, pricePercent, characterId, {
            force,
            refining: { stationRate, taxRate },
            quantityColumn,
          }),
          compareHubs(submitted, pricePercent, { force, quantityColumn }),
        ]);
        if (cancelled) return;
        setBase(outcome);
        setBaseCompare(compareRows);
      } catch {
        if (cancelled) return;
        setBase(null);
        setBaseCompare(null);
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    submitted,
    hub,
    pricePercent,
    characterId,
    forceTick,
    stationRate,
    taxRate,
    refiningReady,
    quantityColumn,
  ]);

  const appraiseText = useCallback((next: string) => {
    setText(next);
    setPick((current) => (current?.text === next ? current : null));
    if (next.trim() === '') return;
    void useRecentAppraisals
      .getState()
      .hydrate()
      .then(() => {
        const { value, setValue } = useRecentAppraisals.getState();
        return setValue(addRecent(value, next, Date.now()));
      });
    setSubmitted(next);
    setForceTick((tick) => tick + 1);
  }, []);

  const appraise = useCallback(() => appraiseText(text), [text, appraiseText]);

  const clear = useCallback(() => {
    setText('');
    setPick(null);
    setSubmitted('');
    setBase(null);
    setBaseCompare(null);
    setLoading(false);
    setFailed(false);
  }, []);

  const {
    result,
    compare,
    live,
    compareLive,
    settle: settleLive,
    forceNextRun,
  } = useAppraisalLive({ base, baseCompare, hub, pricePercent, compareOpen });

  const refresh = useCallback(() => {
    forced.current = true;
    forceNextRun();
    setForceTick((tick) => tick + 1);
  }, [forceNextRun]);

  return {
    text,
    setText,
    appraiseText,
    submitted,
    quantityColumn,
    chooseQuantityColumn: (column: number) => setPick({ text: submitted, column }),
    result,
    compare,
    loading,
    failed,
    canAppraise: text.trim() !== '',
    appraise,
    clear,
    refresh,
    live,
    compareLive,
    setCompareOpen,
    settleLive,
  };
}
