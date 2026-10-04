/**
 * "Ways to fly this leg" (issue #2477): beside a leg's rows, each way to fly
 * it as a small box — its name and jumps, then dim facts (lowest security,
 * lowsec and nullsec counts, Gank Chokepoints passed) and Use for this leg.
 * Through a hole, each hole jump follows: where it joins, the size it fits
 * and the life it has left. The way in use has an accent edge and an In use
 * badge.
 *
 * On a phone the panel folds under the leg header to one line — "Gates only:
 * 33 j · compare" — and opens in place.
 *
 * Via Ansiblex (issue #2478) is one more way, with a line per bridge it
 * crosses. With Use jump bridges on and no gate known yet, its box offers
 * Find with a character or paste a list instead.
 *
 * Facts only, never verdicts (decision `20260912-172628`): no way is called
 * better, safer or riskier than another.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { textActionClassName } from '@/components/ui';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { useIsPhone } from '@/lib/useIsPhone';
import type { RouteHolesState } from './useRouteHoles';
import type { RouteSafetyLeg, RouteSafetyWay } from './useRouteSafety';

const badgeClassName =
  'rounded-xs border border-accent-dim px-1 text-[0.625rem] tracking-widest text-accent uppercase';

function Dot() {
  return (
    <span aria-hidden="true" className="text-text-faint">
      ·
    </span>
  );
}

function useWayLabel() {
  const { t } = useTranslation();
  return (way: RouteSafetyWay) =>
    way.kind === 'hole'
      ? t('travel.ways.kind.hole', {
          hub: t(`travel.thera.hub.${way.holes[0]?.hole.hub ?? 'thera'}`),
        })
      : t(`travel.ways.kind.${way.kind}`);
}

function WayBox({
  way,
  number,
  to,
  nameOf,
  now,
  onUse,
}: {
  way: RouteSafetyWay;
  number: number;
  to: string;
  nameOf: (systemId: number) => string;
  now: number;
  onUse: (pin: string | null) => void;
}) {
  const { t } = useTranslation();
  const label = useWayLabel()(way);
  const { summary } = way;
  const facts: string[] = [];
  if (summary) {
    if (summary.lowestSecurity !== null) {
      facts.push(t('travel.summary.lowest', { security: summary.lowestSecurity.toFixed(1) }));
    }
    facts.push(t('travel.ways.lowsec', { count: summary.lowsec }));
    facts.push(t('travel.ways.nullsec', { count: summary.nullsec }));
    if (summary.chokepoints.length > 0) {
      facts.push(t('travel.ways.passes', { names: summary.chokepoints.join(', ') }));
    }
  }
  const canUse = !way.inUse && summary !== null;

  return (
    <li
      className={cx(
        'rounded-xs border border-line px-2 py-1.5',
        way.inUse && 'border-l-2 border-l-accent bg-panel-2'
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-semibold">{label}</span>
        {way.inUse && <span className={badgeClassName}>{t('travel.ways.inUse')}</span>}
        <span className="ml-auto tabular-nums">
          {summary
            ? t('travel.legs.jumps', { count: summary.jumps })
            : t('travel.ways.noRoute', { to })}
        </span>
      </div>
      {(facts.length > 0 || canUse) && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-text-dim">
          {facts.map((fact, index) => (
            <span key={fact} className="inline-flex gap-1.5">
              {index > 0 && <Dot />}
              {fact}
            </span>
          ))}
          {canUse && (
            <>
              {facts.length > 0 && <Dot />}
              <button
                type="button"
                className={textActionClassName()}
                aria-label={t('travel.ways.useLabel', { way: label, number })}
                onClick={() => onUse(way.pin)}
              >
                {t('travel.ways.use')}
              </button>
            </>
          )}
        </p>
      )}
      {way.bridges.map(({ from, to: bridgeTo, gate }) => (
        <p
          key={`bridge-${from}-${bridgeTo}`}
          className="flex flex-wrap items-center gap-x-1.5 text-sm text-text-dim"
        >
          <span aria-hidden="true">⇉</span>
          <span>{t('travel.ways.bridge', { from: nameOf(from), to: nameOf(bridgeTo) })}</span>
          {gate.name !== '' && (
            <>
              <Dot />
              <span className="min-w-0 truncate">{gate.name}</span>
            </>
          )}
        </p>
      ))}
      {way.holes.map(({ from, to: holeTo, hole }) => (
        <p
          key={`${from}-${holeTo}`}
          className="flex flex-wrap items-center gap-x-1.5 text-sm text-text-dim"
        >
          <span aria-hidden="true">⤳</span>
          <span>{t('travel.ways.hole', { from: nameOf(from), to: nameOf(holeTo) })}</span>
          {hole.maxShipSize && (
            <>
              <Dot />
              <span>
                {t('travel.holes.fits', { size: t(`travel.thera.size.${hole.maxShipSize}`) })}
              </span>
            </>
          )}
          <Dot />
          <span className="tabular-nums">
            {t('travel.thera.lifeLeft', {
              time: formatCountdown(Math.max(0, hole.expiresAt - now) / 1000),
            })}
          </span>
        </p>
      ))}
    </li>
  );
}

export interface LegWaysProps {
  leg: RouteSafetyLeg;
  /** The leg's place in the trip, from 1. */
  number: number;
  /** Whether the trip has legs of its own: a single route's panel names its ends instead. */
  multiStop: boolean;
  nameOf: (systemId: number) => string;
  now: number;
  /**
   * Where the hole list stands: off, the panel says how to compare ways
   * through a hole; loading, a pin waiting on it is not reported yet.
   */
  holes: RouteHolesState['kind'];
  /**
   * Where the Ansiblex list stands: `off` while Use jump bridges is off,
   * `none` when it is on and no gate is known — Via Ansiblex then offers
   * the ways to find some.
   */
  bridges: 'off' | 'none' | 'known';
  /** Opens the Ansiblex list, at a character search or the paste box. */
  onSetUpBridges: (mode: 'search' | 'paste') => void;
  onUse: (pin: string | null) => void;
}

/** Via Ansiblex while no gate is known: the two ways to find some. */
function BridgeSetupBox({ onSetUpBridges }: Pick<LegWaysProps, 'onSetUpBridges'>) {
  const { t } = useTranslation();
  return (
    <li className="rounded-xs border border-dashed border-line px-2 py-1.5">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold">{t('travel.ways.kind.ansiblex')}</span>
        <span className="ml-auto text-text-dim">{t('travel.ways.noBridges')}</span>
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-text-dim">
        <button
          type="button"
          className={textActionClassName()}
          onClick={() => onSetUpBridges('search')}
        >
          {t('travel.ways.findBridges')}
        </button>
        <span>{t('travel.ways.or')}</span>
        <button
          type="button"
          className={textActionClassName()}
          onClick={() => onSetUpBridges('paste')}
        >
          {t('travel.ways.pasteBridges')}
        </button>
      </p>
    </li>
  );
}

function LegWaysPanel({
  leg,
  number,
  multiStop,
  nameOf,
  now,
  holes,
  bridges,
  onSetUpBridges,
  onUse,
}: LegWaysProps) {
  const { t } = useTranslation();
  const ends = { number, from: nameOf(leg.from), to: nameOf(leg.to) };
  return (
    <section aria-label={t('travel.ways.label', { number })} className="space-y-1.5">
      <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {multiStop ? t('travel.ways.title', ends) : t('travel.ways.titleRoute', ends)}
      </h3>
      <ul className="grid gap-1.5 @xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-1">
        {leg.ways.map((way) => (
          <WayBox
            key={`${way.kind}-${way.pin ?? ''}`}
            way={way}
            number={number}
            to={ends.to}
            nameOf={nameOf}
            now={now}
            onUse={onUse}
          />
        ))}
        {bridges === 'none' && <BridgeSetupBox onSetUpBridges={onSetUpBridges} />}
      </ul>
      {holes === 'off' && <p className="text-sm text-text-dim">{t('travel.ways.holesHint')}</p>}
    </section>
  );
}

/** The phone's folded line: the first way not in use (else the one in use) and its jumps. */
function PhoneLine({
  leg,
  number,
  nameOf,
  open,
  onToggle,
}: {
  leg: RouteSafetyLeg;
  number: number;
  nameOf: (systemId: number) => string;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const label = useWayLabel();
  const way = leg.ways.find((candidate) => !candidate.inUse) ?? leg.ways[0];
  if (!way) return null;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={t('travel.ways.phoneToggle', { number })}
      onClick={onToggle}
      className="flex min-h-11 w-full items-center gap-1.5 text-left text-sm text-text-dim"
    >
      <span>
        {t('travel.ways.phoneLine', {
          way: label(way),
          jumps: way.summary
            ? t('travel.legs.jumps', { count: way.summary.jumps })
            : t('travel.ways.noRoute', { to: nameOf(leg.to) }),
        })}
      </span>
      <Dot />
      <span className="font-semibold text-accent">
        {open ? t('travel.ways.hide') : t('travel.ways.compare')}
      </span>
    </button>
  );
}

/**
 * One leg's body: the pin note when a pin could not be flown, the ways panel
 * beside the rows when the leg itself is at least `@5xl` wide (above them,
 * two or three across, when it is narrower), and folded to a line under the
 * leg header on a phone.
 */
export function LegBody({ children, ...props }: LegWaysProps & { children: ReactNode }) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [open, setOpen] = useState(false);
  const { leg, holes, nameOf } = props;
  // A pin waiting on the hole list: said once the list is off or unreachable, not while it loads.
  const noteKey =
    leg.pinNote === 'no-list' ? (holes === 'loading' ? null : `no-list-${holes}`) : leg.pinNote;
  const note =
    noteKey === null
      ? null
      : t(`travel.ways.pinNote.${noteKey}`, {
          to: nameOf(leg.to),
          hub: t(`travel.thera.hub.${leg.pin === 'turnur' ? 'turnur' : 'thera'}`),
        });
  return (
    <div className="space-y-2">
      {note && (
        <p role="status" className="text-text-dim">
          {note}
        </p>
      )}
      {/* Beside the rows only when this panel, not the screen, has room: the rules column and the nav rail both eat into it. */}
      <div className="@container">
        <div className="grid items-start gap-3 @5xl:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="@5xl:order-last">
            {isPhone ? (
              <>
                <PhoneLine
                  leg={leg}
                  number={props.number}
                  nameOf={nameOf}
                  open={open}
                  onToggle={() => setOpen((was) => !was)}
                />
                {open && <LegWaysPanel {...props} />}
              </>
            ) : (
              <LegWaysPanel {...props} />
            )}
          </div>
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
