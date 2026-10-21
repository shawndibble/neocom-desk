/**
 * Route Safety's three preference cards: Safer, Shorter and Less secure, each
 * the same trip planned under that Route Preference, facts side by side.
 *
 * The cards are the Route Preference picker, a second face for the control in
 * Route rules (one variable, decision `20261006-143832`): choosing one saves
 * the pilot's default, exactly as that segmented control does.
 *
 * Conditions, never verdicts (decision `20260912-172628`): a card shows jumps,
 * the lowest security, last hour's kills and Gank Chokepoints, and never which
 * to take. Until a route exists the cards show dashes, so the page already has
 * its shape.
 */
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
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // One tab stop: the chosen card, or the first when none shows as chosen.
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
  return (
    <div
      role="radiogroup"
      aria-label={t('travel.options.label')}
      className="grid grid-cols-[repeat(3,minmax(15rem,1fr))] gap-2 max-md:-mx-4 max-md:overflow-x-auto max-md:px-4 max-md:pb-1 md:grid-cols-3"
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
