/**
 * Find best's P3 and P4 list: each product's multi-planet chain estimate, in a
 * panel of its own under the one-planet picks. No pick number and no
 * comparison with one-planet figures (decision 20261006-095530); the name opens
 * the product's PI detail, which holds the chain.
 */
import { useTranslation } from 'react-i18next';
import { IskAmount, Panel, TypeIcon } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { EstimateBadge, TierChip } from './DirectiveRow';
import { chainAssumptions } from './chainEstimateText';
import type { ChainPicks } from './findBestView';
import { PiProductLink } from './PiProductLink';

export function ChainPicksPanel({ picks }: { picks: ChainPicks }) {
  const { t } = useTranslation();
  if (picks.rows.length === 0 && picks.pending === 0) return null;
  return (
    <Panel
      title={t('piPlan.find.chainTitle')}
      wrapMeta
      meta={
        <span className="text-[0.6875rem] text-text-dim max-md:basis-full">
          {t('piPlan.find.chainMeta')}
        </span>
      }
      actions={<EstimateBadge />}
      padded={false}
    >
      <ul className="divide-y divide-line">
        {picks.rows.map(({ typeId, name, tier, estimate }) => (
          <li key={typeId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
            <TypeIcon typeId={typeId} size={32} width={24} height={24} />
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-sm">
              <PiProductLink typeId={typeId}>
                <b className="font-semibold">{name}</b>
              </PiProductLink>
              <TierChip tier={tier} />
            </span>
            <span className="text-xs text-text-dim">
              <HintText content={chainAssumptions(t, estimate)}>
                {t('piShared.chain.tileLabel', { count: estimate.planets.length })}
              </HintText>
            </span>
            <b className="text-base font-semibold tabular-nums">
              <IskAmount value={estimate.iskPerDay} decimals={0} />
              <span className="text-[0.6875rem] font-normal text-text-dim">
                {t('piPlan.make.perDay')}
              </span>
            </b>
          </li>
        ))}
      </ul>
      {picks.pending > 0 && (
        <p role="status" className="border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim">
          {t('piPlan.find.chainPending', { count: picks.pending })}
        </p>
      )}
    </Panel>
  );
}
