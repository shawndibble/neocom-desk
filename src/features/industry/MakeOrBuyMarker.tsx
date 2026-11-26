import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { MakeOrBuy } from '@/engine/industry/makeOrBuy';
import { cx } from '@/lib/cx';
import { BUILD_GLYPH, makeOrBuyLabel, makeOrBuyReason, makeOrBuyVerdict } from './makeOrBuyText';

export function MakeOrBuyTooltip({
  advice,
  remaining,
  action,
}: {
  advice?: MakeOrBuy;
  remaining: number;
  action?: 'build' | 'buy';
}) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-col gap-1">
      {advice && (
        <>
          <span className="font-semibold">{makeOrBuyVerdict(advice, t)}</span>
          <span>{makeOrBuyReason(advice, remaining, t)}</span>
        </>
      )}
      {action && (
        <span>{t(`industry.makeOrBuy.${action === 'build' ? 'clickBuild' : 'clickBuy'}`)}</span>
      )}
    </span>
  );
}

export function MakeOrBuyMarker({
  advice,
  remaining,
  badge = false,
}: {
  advice: MakeOrBuy;
  remaining: number;
  badge?: boolean;
}) {
  const { t } = useTranslation();
  const building = advice.verdict === 'build';
  const label = makeOrBuyLabel(advice, remaining, t);
  const planetary = building && advice.method === 'planetary';
  const Glyph = building ? BUILD_GLYPH[advice.method] : Icon.Buy;
  const tone = planetary ? 'text-accent' : building ? 'text-isk-pos' : 'text-text-dim';
  return (
    <Tooltip content={<MakeOrBuyTooltip advice={advice} remaining={remaining} />} openOnTap>
      <span
        role="img"
        aria-label={label}
        className={cx(
          'shrink-0',
          tone,
          badge &&
            'rounded-xs border border-current px-1 text-[0.6875rem] leading-4 font-bold tracking-widest uppercase'
        )}
      >
        {badge ? (
          t(
            `industry.errands.badge.${building ? (advice.method === 'manufacturing' ? 'build' : advice.method) : 'buy'}`
          )
        ) : (
          <Glyph size={Icon.ICON_SIZE.sm} />
        )}
      </span>
    </Tooltip>
  );
}
