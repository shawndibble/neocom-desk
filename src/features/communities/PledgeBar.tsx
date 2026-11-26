import { useTranslation } from 'react-i18next';
import type { LineProgress } from '@/engine/communities/requests';
import { formatQuantity } from './requestFormat';

export function PledgeBar({ needed, pledged, delivered, unit }: LineProgress & { unit?: 'lines' }) {
  const { t } = useTranslation();
  const pct = (n: number) => `${Math.min(100, (n / Math.max(needed, 1)) * 100)}%`;
  return (
    <div className="min-w-32">
      <div aria-hidden className="relative h-1.5 overflow-hidden rounded-full bg-line">
        <div className="absolute inset-y-0 left-0 bg-accent-dim" style={{ width: pct(pledged) }} />
        <div className="absolute inset-y-0 left-0 bg-success" style={{ width: pct(delivered) }} />
      </div>
      <p className="mt-1 text-[0.6875rem] text-text-dim tabular-nums">
        {t(
          unit === 'lines' ? 'communities.board.progressLines' : 'communities.board.progressUnits',
          {
            delivered: formatQuantity(delivered),
            pledged: formatQuantity(pledged),
            needed: formatQuantity(needed),
          }
        )}
      </p>
    </div>
  );
}
