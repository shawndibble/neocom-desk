import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { useTicker } from '@/lib/ticker';
import { arrivalNotice, uncheckedSince, type SettledEntryRef } from '@/engine/miningTax/oreArrival';
import { useOreArrivalLog } from './oreArrivalLog';

interface OreArrivalNoticeProps {
  /** The entries ticked for this settlement. */
  entries: readonly SettledEntryRef[];
  /** The pull Settle up started is still running. */
  checking: boolean;
  /** When that pull started; `null` when Settle up started none. */
  pullStartedAt: number | null;
}

const MINUTE_MS = 60_000;

/**
 * Settle up's one line about ore that may still be on its way (scope decision
 * 20261004 "settle up waits for ore still arriving"): a yellow "wait" while a
 * ticked entry grew within the hour, small print while one could still grow,
 * nothing once none can. Skimmable on purpose — a longer note gets ignored.
 */
export function OreArrivalNotice({ entries, checking, pullStartedAt }: OreArrivalNoticeProps) {
  const { t } = useTranslation();
  const now = useTicker(MINUTE_MS);
  const log = useOreArrivalLog((state) => state.value);
  const hydrate = useOreArrivalLog((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const notice = arrivalNotice(entries, log, now);
  if (notice.kind === 'none') return null;

  if (notice.kind === 'arriving') {
    const minutes = Math.max(1, Math.ceil(notice.waitMs / MINUTE_MS));
    return (
      <p role="status" className="flex items-center gap-1.5 text-xs text-warning">
        <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />
        {notice.arriving === notice.of
          ? t('miningTax.settleUp.arrival.arriving', { minutes })
          : t('miningTax.settleUp.arrival.arrivingSome', { count: notice.arriving, minutes })}
      </p>
    );
  }

  let key = 'miningTax.settleUp.arrival.quiet';
  if (checking) key = 'miningTax.settleUp.arrival.checking';
  else if (pullStartedAt !== null && uncheckedSince(entries, log, pullStartedAt, now))
    key = 'miningTax.settleUp.arrival.unchecked';
  return (
    <p role="status" className="text-xs text-text-dim">
      {t(key)}
    </p>
  );
}
