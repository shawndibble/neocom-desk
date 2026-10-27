import { useState } from 'react';
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

  async function handleOpenInJanice() {
    if (janice.status === 'fetching' || text.trim() === '') return;
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setJanice({ status: 'fetching' });
    const result = await requestJaniceAppraisal({ text, hub, pricePercent });
    if (result.ok) {
      if (tab) tab.location.href = result.url;
      else window.open(result.url, '_blank', 'noopener,noreferrer');
      setJanice({ status: 'idle' });
    } else {
      tab?.close();
      setJanice({ status: 'failed', reason: result.reason });
    }
  }

  return { janice, handleOpenInJanice, dismissJanice: () => setJanice({ status: 'idle' }) };
}
