import { useRef, useState } from 'react';
import type { TradeHub } from '@/market/hubs';
import { requestJaniceAppraisal, type JaniceFailure } from './janice';

export type JaniceState =
  { status: 'idle' } | { status: 'fetching' } | { status: 'failed'; reason: JaniceFailure };

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
  const inFlight = useRef(false);

  async function handleOpenInJanice() {
    if (inFlight.current || text.trim() === '') return;
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
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
