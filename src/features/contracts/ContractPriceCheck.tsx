import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Eyebrow, eyebrowClassName, Spinner, Tooltip } from '@/components/ui';
import {
  focusRingClassName,
  interactiveClassName,
  popoverValueClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { HubMenu, type PriceSide } from '@/features/market/HubMenu';
import { usePricePercentFor, withPercent } from '@/features/market/pagePricePercents';
import { useHubFor } from '@/features/market/hub';
import type { PageHubArea } from '@/features/market/pageHubs';
import type { TradeHub } from '@/market/hubs';

const flipClassName = `min-h-6 shrink-0 whitespace-nowrap font-semibold text-accent text-left rounded-xs ${interactiveClassName} ${focusRingClassName}`;

export interface PriceCheckRowModel {
  label: string;
  value: string;
  note?: string;
  sub?: boolean;
  dim?: boolean;
  tone?: 'good' | 'bad';
}

export interface PriceCheckFlip {
  label: string;
  showOther: string;
  onFlip: () => void;
}

export interface PriceCheckHubMenu {
  hub: TradeHub;
  area: PageHubArea;
  side?: PriceSide;
}

export function ContractPriceCheck({
  heading,
  rows,
  flip,
  hubMenu,
  message,
  busy = false,
}: {
  heading: string;
  rows: readonly PriceCheckRowModel[];
  flip?: PriceCheckFlip;
  hubMenu?: PriceCheckHubMenu;
  message?: ReactNode;
  busy?: boolean;
}) {
  return (
    <section aria-label={heading}>
      <div className="flex items-baseline justify-between gap-2">
        {hubMenu ? (
          <HeadingWithHubMenu heading={heading} menu={hubMenu} />
        ) : (
          <Eyebrow>{heading}</Eyebrow>
        )}
        {flip && (
          <Tooltip content={flip.showOther}>
            <button type="button" className={flipClassName} onClick={flip.onFlip}>
              {flip.label}
            </button>
          </Tooltip>
        )}
      </div>
      {busy ? (
        <div className="flex justify-center py-3">
          <Spinner size="sm" label={heading} />
        </div>
      ) : message ? (
        <p className="border-y border-line py-2 text-text-dim">{message}</p>
      ) : (
        <dl className="mt-1 divide-y divide-line border-y border-line">
          {rows.map((row) => (
            <div
              key={row.label}
              className={cx('flex items-baseline justify-between gap-3 py-1.5', row.sub && 'pl-3')}
            >
              <dt className="text-text-dim">{row.label}</dt>
              <dd className="text-right">
                <span
                  className={cx(
                    'tabular-nums font-semibold',
                    row.dim && 'text-text-dim',
                    row.tone === 'good' && 'text-isk-pos',
                    row.tone === 'bad' && 'text-isk-neg'
                  )}
                >
                  {row.value}
                </span>
                {row.note && <span className="block text-text-dim">{row.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function HeadingWithHubMenu({ heading, menu }: { heading: string; menu: PriceCheckHubMenu }) {
  const { t } = useTranslation();
  const { closestFound } = useHubFor(menu.area);
  const percent = usePricePercentFor(menu.area);
  const at = heading.indexOf(menu.hub.stationLabel);
  if (at < 0) return <Eyebrow>{heading}</Eyebrow>;
  const hubText = closestFound
    ? t('pageHubs.closestFound', { hub: menu.hub.stationLabel })
    : menu.hub.stationLabel;
  const shown = menu.side ? withPercent(t, hubText, percent) : hubText;
  return (
    <p className="text-[0.6875rem] text-text-dim">
      <span className={eyebrowClassName}>{heading.slice(0, at)}</span>
      <HubMenu
        area={menu.area}
        side={menu.side}
        triggerClassName={cx(
          popoverValueClassName,
          'inline-flex min-h-6 items-baseline touch:min-h-9'
        )}
        triggerLabel={t('contractDetail.priceCheckHubMenu', { hub: shown })}
      >
        {shown}
      </HubMenu>
      {heading.slice(at + menu.hub.stationLabel.length)}
    </p>
  );
}
