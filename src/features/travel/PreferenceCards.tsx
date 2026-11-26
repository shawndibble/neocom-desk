import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { securityStatusColor } from '@/engine/securityStatus';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import type { PreferenceCard } from '@/engine/route/routePreferenceCards';
import { ROUTE_PREFERENCE_SHORT_LABEL_KEYS } from '@/features/route/routePreferences';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { focusRingClassName } from '@/components/ui/controlStyles';
import { formatNumber } from '@/lib/numberLocale';
import { SegmentedControl } from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';

const PHONE_ORDER: readonly RoutePreferenceKind[] = ['shortest', 'prefer-highsec', 'avoid-highsec'];

function Strip({ securities }: { securities: PreferenceCard['securities'] }) {
  return (
    <div aria-hidden="true" className="flex h-1.5 gap-px">
      {securities.length === 0
        ? Array.from({ length: 14 }, (_, i) => <i key={i} className="flex-1 rounded-xs bg-line" />)
        : securities.map((security, i) => (
            <i
              key={i}
              className="flex-1 rounded-xs bg-line"
              style={
                security === null ? undefined : { backgroundColor: securityStatusColor(security) }
              }
            />
          ))}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide whitespace-nowrap text-text-dim">
        {label}
      </dt>
      <dd className="text-lg font-semibold leading-tight tabular-nums">{children}</dd>
    </div>
  );
}

const DASH = '—';

function CardBody({ card }: { card: PreferenceCard }) {
  const { t } = useTranslation();
  const { summary } = card;
  return (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold">
          {card.active && <Icon.Select aria-hidden="true" className="text-accent" />}
          {t(ROUTE_PREFERENCE_SHORT_LABEL_KEYS[card.preference])}
        </span>
        {card.sameRouteAs !== null && (
          <span className="text-xs text-text-dim">
            {t('travel.options.sameRoute', {
              preference: t(ROUTE_PREFERENCE_SHORT_LABEL_KEYS[card.sameRouteAs]),
            })}
          </span>
        )}
      </span>
      <Strip securities={card.securities} />
      <dl className="flex flex-wrap justify-between gap-x-4 gap-y-2">
        <Fact label={t('travel.summary.jumpsLabel')}>{summary?.jumps ?? DASH}</Fact>
        <Fact label={t('travel.summary.lowestLabel')}>
          {summary?.lowestSecurity == null ? (
            DASH
          ) : (
            <SecurityStatus security={summary.lowestSecurity} />
          )}
        </Fact>
        <Fact label={t('travel.summary.killsLabel')}>
          {card.kills === null ? DASH : formatNumber(card.kills)}
        </Fact>
        <Fact label={t('travel.summary.chokepointsLabel')}>
          {summary === null ? DASH : summary.chokepoints.length}
        </Fact>
      </dl>
    </>
  );
}

export function PreferenceCards({
  cards,
  onSelect,
}: {
  cards: readonly PreferenceCard[];
  onSelect: (preference: RoutePreferenceKind) => void;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const stop = Math.max(
    0,
    cards.findIndex((card) => card.active)
  );
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = cards.length - 1;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (index + 1) % cards.length
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index - 1 + cards.length) % cards.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    buttons.current[next]?.focus();
    onSelect(cards[next]!.preference);
  }
  if (isPhone) {
    const chosen = cards.find((card) => card.active) ?? cards[0];
    return (
      <div className="flex flex-col gap-2">
        <SegmentedControl
          fill
          label={t('travel.options.label')}
          value={chosen?.preference ?? PHONE_ORDER[0]!}
          options={PHONE_ORDER.map((preference) => ({
            value: preference,
            label: t(ROUTE_PREFERENCE_SHORT_LABEL_KEYS[preference]),
          }))}
          onChange={onSelect}
        />
        {chosen && (
          <div className="flex flex-col gap-3 rounded-xs border border-line bg-panel p-3">
            <CardBody card={chosen} />
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      role="radiogroup"
      aria-label={t('travel.options.label')}
      className="grid grid-cols-[repeat(3,minmax(15rem,1fr))] gap-2 max-md:-mx-2 max-md:overflow-x-auto max-md:px-2 max-md:pb-1 md:grid-cols-3"
    >
      {cards.map((card, index) => (
        <button
          key={card.preference}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          tabIndex={index === stop ? 0 : -1}
          onKeyDown={(event) => onKeyDown(event, index)}
          type="button"
          role="radio"
          aria-checked={card.active}
          onClick={() => onSelect(card.preference)}
          className={cx(
            'flex min-w-0 flex-col gap-3 rounded-xs border bg-panel p-3 text-left',
            focusRingClassName,
            card.active ? 'border-accent bg-panel-2' : 'border-line hover:border-line-bright'
          )}
        >
          <CardBody card={card} />
        </button>
      ))}
    </div>
  );
}
