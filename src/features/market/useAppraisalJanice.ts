import { useRef, useState } from 'react';
import type { TradeHub } from '@/market/hubs';
import { requestJaniceAppraisal, type JaniceFailure } from './janice';

export type JaniceState =
  { status: 'idle' } | { status: 'fetching' } | { status: 'failed'; reason: JaniceFailure };

/**
 * "Open in Janice": hands the pasted text to Janice and opens the appraisal it
 * makes. The tab opens inside the click, before the request, because a browser
 * blocks a window opened after an `await`; it is pointed at the link when the
 * link arrives and closed if none does.
 */
export function useAppraisalJanice({
  text,
  hub,
  pricePercent,
}: {
  text: string;
  hub: TradeHub;
  pricePercent: number;
}) {
  const [janice, setJanice] = useState<JaniceState>({ status: 'idle' });
  // State lags a render behind a quick second click; a ref does not.
  const inFlight = useRef(false);

  async function handleOpenInJanice() {
    if (inFlight.current || text.trim() === '') return;
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      // A window opened after the request is blocked just the same, so stop here.
      setJanice({ status: 'failed', reason: 'popup-blocked' });
      return;
    }
    tab.opener = null;
    inFlight.current = true;
    setJanice({ status: 'fetching' });
    try {
      const result = await requestJaniceAppraisal({ text, hub, pricePercent });
      if (result.ok) {
        tab.location.href = result.url;
        setJanice({ status: 'idle' });
      } else {
        tab.close();
        setJanice({ status: 'failed', reason: result.reason });
      }
    } finally {
      inFlight.current = false;
    }
  }

  return { janice, handleOpenInJanice, dismissJanice: () => setJanice({ status: 'idle' }) };
}
