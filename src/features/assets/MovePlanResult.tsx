import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Checkbox, Disclosure, Modal } from '@/components/ui';
import { inlineLinkClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import type { MovePlan } from '@/engine/assets/movePlan';
import {
  CharacterScopeReadout,
  type CharacterScopeReadoutProps,
} from '@/features/character/CharacterScopeReadout';
import { useSystemName } from '@/features/route/useSolarSystems';
import { routeToHref } from '@/features/travel/routeSafetyLink';
import { firstConnected, useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { formatCubicMetres } from '@/lib/volume';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { Rail, RailHeading, RailStop } from './MovePlanRail';
import { tripLanes, tripRuns } from './movePlanView';

/** Alternatives shown beside the suggested hauler; the rest sit under "All haulers". */
const INLINE_ALTERNATIVES = 3;

/** "Don't remind me again" on the rig warning, ticked once for good. */
const useSkipRigWarning = createLocalSetting<boolean>({
  key: 'movePlanSkipPackRigWarning',
  defaultValue: false,
});

export interface PlanState {
  plan: MovePlan;
  destinationSystem: number | null;
  /** The destination station's name, when one was picked. */
  destinationStation: string | null;
  /** System of each pickup location, for the Route Safety link's start. */
  pickupSystems: ReadonlyMap<number, number | null>;
}

interface PlanResultProps {
  state: PlanState;
  scope: CharacterScopeReadoutProps;
  compareOpen: boolean;
  onToggleCompare: () => void;
  /** The plan's screen-reader heading, where focus lands once the plan shows. */
  headingRef: Ref<HTMLHeadingElement>;
  onBack: () => void;
  onDone: () => void;
  /** Haul this ship (itemID) packaged instead of flying it. */
  onPackShip: (itemId: number) => void;
  /** Rigs fitted to a ship; packing it means unfitting them, which destroys them. */
  rigsOf: (itemId: number) => number;
  /** Whether the ship type has a packaged volume to plan with. */
  canPack: (typeId: number) => boolean;
  name: (typeId: number) => string;
  placeLabel: (id: number) => string;
  /** Palette slot of a pickup location. */
  hueOf: (locationId: number) => number;
}

/**
 * The plan: the suggested hauler and the load split by pickup and trip on top,
 * then the rail from each Character's pickups to the destination.
 */
export function PlanResult({
  state,
  scope,
  compareOpen,
  onToggleCompare,
  headingRef,
  onBack,
  onDone,
  onPackShip,
  rigsOf,
  canPack,
  name,
  placeLabel,
  hueOf,
}: PlanResultProps) {
  const { t } = useTranslation();
  const skipRigWarning = useSkipRigWarning((s) => s.value);
  const setSkipRigWarning = useSkipRigWarning((s) => s.setValue);
  const hydrateSkip = useSkipRigWarning((s) => s.hydrate);
  const [asking, setAsking] = useState<{ itemId: number; typeId: number; rigs: number } | null>(
    null
  );
  const [dontRemind, setDontRemind] = useState(false);
  useEffect(() => {
    void hydrateSkip();
  }, [hydrateSkip]);
  const focusAfterCommit = useFocusAfterCommit();
  /** Pickup the ship being packed sits in; its heading takes focus once the Pack button is gone. */
  const packFrom = useRef<number | null>(null);
  const pickupHeading = () =>
    document.querySelector<HTMLElement>(`[data-pickup-heading="${packFrom.current}"]`);
  const askToPack = (itemId: number, typeId: number, locationId: number) => {
    const rigs = rigsOf(itemId);
    packFrom.current = locationId;
    if (rigs === 0 || skipRigWarning) {
      onPackShip(itemId);
      focusAfterCommit(pickupHeading);
    } else {
      setDontRemind(false);
      setAsking({ itemId, typeId, rigs });
    }
  };
  const { plan, destinationSystem, destinationStation, pickupSystems } = state;
  const systemName = useSystemName(destinationSystem);
  if (plan.perCharacter.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <h3 ref={headingRef} tabIndex={-1} className="sr-only focus:outline-none">
          {t('assets.movePlan.title')}
        </h3>
        <p className="font-medium">{t('assets.movePlan.nothingToMove')}</p>
        <p className="text-text-dim">{t('assets.movePlan.nothingToMoveHint')}</p>
        <div className="flex justify-end gap-2">
          <Button variant="primary" onClick={onBack}>
            {t('assets.movePlan.back')}
          </Button>
        </div>
      </div>
    );
  }
  const { totals } = plan;
  const destinationLabel = destinationStation ?? systemName ?? '';
  const pickups = plan.perCharacter.flatMap((c) => c.pickups);
  const capacity = plan.suggested?.hull.capacityM3 ?? 0;
  const lanes = tripLanes(totals.totalM3, capacity);
  /** Ships flown out: each is a flight of its own, outside the hauler's trips. */
  const flown = pickups.flatMap((p) => p.ships);
  /** Every flown ship is a trip of its own on top of the hauls. */
  const withShips = (hauls: number) => hauls + totals.shipsToFly;
  const alternatives = plan.comparison.filter((o) => o.hull.typeId !== plan.suggested?.hull.typeId);

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 ref={headingRef} tabIndex={-1} className="sr-only focus:outline-none">
          {t('assets.movePlan.title')}
        </h3>
        <CharacterScopeReadout {...scope} />
      </div>
      {plan.suggested ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 rounded-xs border border-accent-dim bg-accent/10 px-3.5 py-3">
          <div className="row-span-2 min-w-14 text-center text-4xl leading-none font-bold text-accent tabular-nums">
            {withShips(plan.suggested.trips)}
            <small className="mt-0.5 block text-xs font-semibold tracking-wide uppercase">
              {t('assets.movePlan.tripsLabel', { count: withShips(plan.suggested.trips) })}
            </small>
          </div>
          <p className="m-0 flex flex-wrap items-center gap-2 font-bold">
            {plan.suggested.hull.name}
            {plan.suggested.hull.owned && (
              <span className="text-xs font-semibold text-success">
                {t('assets.movePlan.youOwnOne')}
              </span>
            )}
            <span className="text-xs font-normal text-text-dim tabular-nums">
              {[
                t('assets.movePlan.haulCount', { count: plan.suggested.trips }),
                totals.shipsToFly > 0 &&
                  t('assets.movePlan.shipFlightCount', { count: totals.shipsToFly }),
              ]
                .filter(Boolean)
                .join(' + ')}
            </span>
          </p>
          {alternatives.length > 0 && (
            <ul className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-xs text-text-dim">
              {alternatives.slice(0, INLINE_ALTERNATIVES).map((o) => (
                <li key={o.hull.typeId}>
                  <b className="font-semibold text-text">{o.hull.name}</b>{' '}
                  {t('assets.movePlan.tripCount', { count: withShips(o.trips) })}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          {totals.shipsToFly > 0 && (
            <div className="flex items-center gap-4 rounded-xs border border-accent-dim bg-accent/10 px-3.5 py-3">
              <div className="min-w-14 text-center text-4xl leading-none font-bold text-accent tabular-nums">
                {totals.shipsToFly}
                <small className="mt-0.5 block text-xs font-semibold tracking-wide uppercase">
                  {t('assets.movePlan.tripsLabel', { count: totals.shipsToFly })}
                </small>
              </div>
              <span className="text-sm font-bold">
                {t('assets.movePlan.shipFlightCount', { count: totals.shipsToFly })}
              </span>
            </div>
          )}
          {totals.totalM3 > 0 && <p className="text-text-dim">{t('assets.movePlan.noHauler')}</p>}
        </>
      )}
      {alternatives.length > INLINE_ALTERNATIVES && (
        <Disclosure
          label={t('assets.movePlan.allHaulers')}
          expanded={compareOpen}
          onToggle={onToggleCompare}
        >
          <ul className="text-text-dim">
            {plan.comparison.map((o) => (
              <li key={o.hull.typeId}>
                {o.hull.name} · {t('assets.movePlan.tripCount', { count: withShips(o.trips) })}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      {(lanes.length > 0 || flown.length > 0) && (
        <div className="flex flex-col gap-1.5">
          <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-text-dim">
            {tripRuns(lanes).map((r) => (
              <li key={r.from} className="tabular-nums">
                {r.from === r.to
                  ? t('assets.movePlan.tripLane', { n: r.from })
                  : t('assets.movePlan.tripRange', { from: r.from, to: r.to })}{' '}
                · {formatCubicMetres(r.m3)} m³
                {r.from === r.to ? '' : ` ${t('assets.movePlan.each')}`}
              </li>
            ))}
            {flown.map((s) => (
              <li key={s.itemId} className="font-semibold text-text">
                {t('assets.movePlan.flyShip', { ship: name(s.typeId) })}
              </li>
            ))}
          </ul>
        </div>
      )}
      <dl className="m-0 flex flex-wrap gap-x-6 gap-y-1.5">
        <Stat
          label={t('assets.movePlan.volume')}
          value={`${formatCubicMetres(totals.totalM3)} m³`}
        />
        <Stat label={t('assets.movePlan.stacks')} value={totals.stacks.toLocaleString()} />
        <Stat
          label={t('assets.movePlan.characters', { count: totals.characters })}
          value={String(totals.characters)}
        />
        <Stat
          label={t('assets.movePlan.ships', { count: totals.shipsToFly })}
          value={String(totals.shipsToFly)}
        />
      </dl>
      <Rail>
        {plan.perCharacter.map((c) => (
          <PlanCharacter
            key={c.characterId}
            count={c.pickups.length}
            totalM3={c.totalM3}
            name={c.name}
          >
            {c.pickups.map((p) => (
              <RailStop key={p.locationId} hue={hueOf(p.locationId)}>
                <section className="rounded-xs border border-line bg-panel-2 px-3 pb-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line pt-2.5 pb-1.5">
                    <h3
                      data-pickup-heading={p.locationId}
                      tabIndex={-1}
                      className="m-0 flex min-w-0 flex-[1_1_12em] flex-wrap max-sm:contents items-baseline gap-x-3 gap-y-0.5 text-sm focus:outline-none"
                    >
                      <span className="min-w-0 flex-1 font-bold max-sm:basis-full [overflow-wrap:anywhere]">
                        {placeLabel(p.locationId)}
                      </span>
                      <span className="font-bold tabular-nums">
                        {formatCubicMetres(p.totalM3)} m³
                      </span>
                    </h3>
                    {destinationSystem !== null && (
                      <Link
                        className={`${inlineLinkClassName} text-sm whitespace-nowrap`}
                        aria-label={t('assets.movePlan.routeSafetyFrom', {
                          place: placeLabel(p.locationId),
                        })}
                        to={routeToHref(destinationSystem, pickupSystems.get(p.locationId) ?? null)}
                      >
                        {t('assets.movePlan.routeSafety')}
                      </Link>
                    )}
                  </div>
                  {totals.totalM3 > 0 && capacity > 0 && (
                    <p className="m-0 pt-1.5 text-xs text-text-dim tabular-nums">
                      {t('assets.movePlan.shareOfLoad', {
                        percent: Math.round((p.totalM3 / totals.totalM3) * 100),
                        hauls:
                          p.totalM3 / capacity < 0.05 ? '<0.1' : (p.totalM3 / capacity).toFixed(1),
                      })}
                    </p>
                  )}
                  <ul className="m-0 flex list-none flex-col p-0">
                    {p.lines.map((l) => (
                      <PlanLine
                        key={l.typeId}
                        name={name(l.typeId)}
                        qty={`× ${l.quantity.toLocaleString()}`}
                        trailing={l.m3 !== null ? `${formatCubicMetres(l.m3)} m³` : null}
                      />
                    ))}
                    {p.unknownVolume.map((u) => (
                      <PlanLine
                        key={`unknown-${u.typeId}`}
                        name={name(u.typeId)}
                        qty={`× ${u.quantity.toLocaleString()}`}
                        trailing={t('assets.movePlan.volumeUnknown')}
                        dim
                      />
                    ))}
                    {p.ships.map((s) => (
                      <PlanLine
                        key={s.itemId}
                        name={name(s.typeId)}
                        qty={
                          <span className="font-semibold text-warning">
                            {t('assets.movePlan.flyIt')}
                          </span>
                        }
                        trailing={
                          canPack(s.typeId) ? (
                            <Button
                              size="sm"
                              onClick={() => askToPack(s.itemId, s.typeId, p.locationId)}
                            >
                              {t('assets.movePlan.packInstead')}
                            </Button>
                          ) : null
                        }
                      />
                    ))}
                  </ul>
                </section>
              </RailStop>
            ))}
          </PlanCharacter>
        ))}
        {destinationLabel && (
          <RailStop destination>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xs border border-dashed border-accent px-3 py-2.5">
              <b className="[overflow-wrap:anywhere]">{destinationLabel}</b>
              <span className="text-text-dim">{t('assets.movePlan.deliverAll')}</span>
            </div>
          </RailStop>
        )}
      </Rail>
      <div className="sticky -bottom-3 mt-auto -mx-3 -mb-3 flex justify-end gap-2 border-t border-line bg-panel px-3 pt-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]">
        <Button variant="ghost" onClick={onBack}>
          {t('assets.movePlan.back')}
        </Button>
        <Button variant="primary" onClick={onDone}>
          {t('assets.movePlan.done')}
        </Button>
      </div>
      <Modal
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={t('assets.movePlan.packTitle', { ship: asking ? name(asking.typeId) : '' })}
        returnFocusFallback={() => firstConnected([pickupHeading])}
      >
        <div className="flex flex-col gap-3 text-sm">
          <p className="m-0">{t('assets.movePlan.packRigWarning', { count: asking?.rigs ?? 0 })}</p>
          <label className={`flex cursor-pointer items-center gap-2 ${tappableRowClassName}`}>
            <Checkbox checked={dontRemind} onChange={(e) => setDontRemind(e.target.checked)} />
            {t('assets.movePlan.dontRemind')}
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAsking(null)}>
              {t('assets.movePlan.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (asking) {
                  if (dontRemind) void setSkipRigWarning(true);
                  onPackShip(asking.itemId);
                }
                setAsking(null);
              }}
            >
              {t('assets.movePlan.packAnyway')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PlanCharacter({
  name,
  count,
  totalM3,
  children,
}: {
  name: string;
  count: number;
  totalM3: number;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <RailHeading name={name}>
        <span className="text-xs font-normal text-text-dim">
          {t('assets.movePlan.pickupSummary', { count, volume: formatCubicMetres(totalM3) })}
        </span>
      </RailHeading>
      {children}
    </>
  );
}

function PlanLine({
  name,
  qty,
  trailing,
  dim = false,
}: {
  name: string;
  qty: ReactNode;
  trailing: ReactNode;
  dim?: boolean;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 border-t border-line py-1.5 first:border-t-0">
      <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
      <span className="text-text-dim tabular-nums">{qty}</span>
      <span className={`min-w-[5.5em] text-right tabular-nums ${dim ? 'text-text-dim' : ''}`}>
        {trailing}
      </span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-xs tracking-wide text-text-dim uppercase">{label}</dt>
      <dd className="m-0 text-base font-bold tabular-nums">{value}</dd>
    </div>
  );
}
