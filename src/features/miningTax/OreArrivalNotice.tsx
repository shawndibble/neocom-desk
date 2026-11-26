import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { useTicker } from '@/lib/ticker';
import { arrivalNotice, uncheckedSince, type SettledEntryRef } from '@/engine/miningTax/oreArrival';
import { useOreArrivalLog } from './oreArrivalLog';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { MINUTE_MS } from '@/lib/age';

interface OreArrivalNoticeProps {
  entries: readonly SettledEntryRef[];
  checking: boolean;
  pullStartedAt: number | null;
}

export function OreArrivalNotice({ entries, checking, pullStartedAt }: OreArrivalNoticeProps) {
  const { t } = useTranslation();
  const now = useTicker(MINUTE_MS);
  const log = useOreArrivalLog((state) => state.value);
  useHydratedStore(useOreArrivalLog);

  const notice = arrivalNotice(entries, log, now);
  if (notice.kind === 'none') return null;

  const arriving = notice.kind === 'arriving';
  let text: string;
  if (arriving) {
    const minutes = Math.max(1, Math.ceil(notice.waitMs / MINUTE_MS));
    text =
      notice.arriving === notice.of
        ? t('miningTax.settleUp.arrival.arriving', { minutes })
        : t('miningTax.settleUp.arrival.arrivingSome', { count: notice.arriving, minutes });
  } else if (checking) text = t('miningTax.settleUp.arrival.checking');
  else if (pullStartedAt !== null && uncheckedSince(entries, log, pullStartedAt, now))
    text = t('miningTax.settleUp.arrival.unchecked');
  else text = t('miningTax.settleUp.arrival.quiet');

  return (
    <p
      role="status"
      className={
        arriving ? 'flex items-center gap-1.5 text-xs text-warning' : 'text-xs text-text-dim'
      }
    >
      {arriving && <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />}
      {text}
    </p>
  );
}
