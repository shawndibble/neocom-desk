import { formatCount } from '@/lib/formatCount';
import { useRef, useState, type ReactNode, type Ref } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Eyebrow } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { Well } from '@/components/ui/Well';
import {
  CUSTOM_HAULER_TYPE_ID,
  type HaulerOverride,
  type MovePlan,
} from '@/engine/assets/movePlan';
import { useSystemName } from '@/features/route/useSolarSystems';
import { firstConnected, useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { formatCubicMetres } from '@/lib/volume';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { Rail, RailHeading, RailStop } from './MovePlanRail';
import { PlanLine } from './MovePlanLine';
import { PickupHaulList } from './MovePlanHauls';
import { HaulerPicker } from './MovePlanHaulerPicker';
import { MaxIskInput } from './MovePlanMaxIsk';
import { PlaceName } from './PlaceName';

const useSkipRigWarning = createLocalSetting<boolean>({
  key: 'movePlanSkipPackRigWarning',
  defaultValue: false,
});

export interface PlanState {
  plan: MovePlan;
  destinationSystem: number | null;
  destinationStation: string | null;
  pickupSystems: ReadonlyMap<number, number | null>;
  haulerSizing?: 'unavailable' | 'loading';
  pricesUnavailable?: boolean;
}

interface PlanResultProps {
  state: PlanState;
  compareOpen: boolean;
  onToggleCompare: () => void;
  haulerOverride: HaulerOverride | undefined;
  onPickHauler: (override: HaulerOverride | undefined) => void;
  maxIsk: number | null;
  onChangeMaxIsk: (value: number | null) => void;
  headingRef: Ref<HTMLHeadingElement>;
  onBack: () => void;
  onShowRoute?: () => void;
  routing?: boolean;
  routeFailed?: boolean;
  onPackShip: (itemId: number) => void;
  onUnpackShip: (itemId: number) => void;
  rigsOf: (itemId: number) => number;
  canPack: (typeId: number) => boolean;
  name: (typeId: number) => string;
  placeLabel: (id: number) => string;
  hueOf: (locationId: number) => number;
}

export function PlanResult({
  state,
  compareOpen,
  onToggleCompare,
  haulerOverride,
  onPickHauler,
  maxIsk,
  onChangeMaxIsk,
  headingRef,
  onBack,
  onShowRoute,
  routing = false,
  routeFailed = false,
  onPackShip,
  onUnpackShip,
  rigsOf,
  canPack,
  name,
  placeLabel,
  hueOf,
}: PlanResultProps) {
  const { t } = useTranslation();
  const skipRigWarning = useSkipRigWarning((s) => s.value);
  const setSkipRigWarning = useSkipRigWarning((s) => s.setValue);
  useHydratedStore(useSkipRigWarning);
  const [asking, setAsking] = useState<{ itemId: number; typeId: number; rigs: number } | null>(
    null
  );
  const [dontRemind, setDontRemind] = useState(false);
  const [ownedFirst, setOwnedFirst] = useState(false);
  const focusAfterCommit = useFocusAfterCommit({ preventScroll: true });
  const packFrom = useRef<string | null>(null);
  const pickupHeading = () =>
    document.querySelector<HTMLElement>(`[data-pickup-heading="${packFrom.current}"]`);
  const askToPack = (itemId: number, typeId: number, pickupKey: string) => {
    const rigs = rigsOf(itemId);
    packFrom.current = pickupKey;
    if (rigs === 0 || skipRigWarning) {
      onPackShip(itemId);
      focusAfterCommit(pickupHeading);
    } else {
      setDontRemind(false);
      setAsking({ itemId, typeId, rigs });
    }
  };
  const { plan, destinationSystem, destinationStation } = state;
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
  const active = plan.active;
  const capacity = active?.hull.capacityM3 ?? 0;
  const haulerName = (hull: { typeId: number; name: string; capacityM3: number }) =>
    hull.typeId === CUSTOM_HAULER_TYPE_ID
      ? t('assets.movePlan.customHold', { volume: formatCubicMetres(hull.capacityM3) })
      : hull.name;
  const flownShips = plan.perCharacter.flatMap((c) =>
    c.pickups.flatMap((p) =>
      p.ships.map((ship) => ({ ship, pickupKey: `${c.characterId}:${p.locationId}` }))
    )
  );
  const flown = flownShips.map((f) => f.ship);
  const withShips = (hauls: number, tooBig = 0) => hauls + totals.shipsToFly + tooBig;
  const tooBig = active?.tooBigCount ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <h3 ref={headingRef} tabIndex={-1} className="sr-only focus:outline-none">
        {t('assets.movePlan.title')}
      </h3>
      {active ? (
        <Well
          size="lg"
          className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
        >
          <div className="min-w-14 text-center text-3xl leading-none font-bold tabular-nums">
            {withShips(active.trips, tooBig)}
            <small className="mt-0.5 block text-xs font-semibold tracking-widest text-text-dim uppercase">
              {t('assets.movePlan.tripsLabel', { count: withShips(active.trips, tooBig) })}
            </small>
          </div>
          <p className="m-0 flex flex-wrap items-center gap-2 font-bold">
            {haulerName(active.hull)}
            {active.hull.owned && (
              <span className="text-xs font-semibold text-success">
                {t('assets.movePlan.youOwnOne')}
              </span>
            )}
            <span className="text-xs font-normal text-text-dim tabular-nums">
              {[
                t('assets.movePlan.haulCount', { count: active.trips }),
                totals.shipsToFly + tooBig > 0 &&
                  t('assets.movePlan.shipFlightCount', { count: totals.shipsToFly + tooBig }),
              ]
                .filter(Boolean)
                .join(' + ')}
            </span>
          </p>
          {totals.totalM3 > 0 && (
            <div className="col-span-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
              <MaxIskInput value={maxIsk} onChange={onChangeMaxIsk} />
            </div>
          )}
        </Well>
      ) : (
        <>
          {totals.shipsToFly > 0 && (
            <Well size="lg" className="flex items-center gap-4">
              <div className="min-w-14 text-center text-3xl leading-none font-bold tabular-nums">
                {totals.shipsToFly}
                <small className="mt-0.5 block text-xs font-semibold tracking-widest text-text-dim uppercase">
                  {t('assets.movePlan.tripsLabel', { count: totals.shipsToFly })}
                </small>
              </div>
              <span className="text-sm font-bold">
                {t('assets.movePlan.shipFlightCount', { count: totals.shipsToFly })}
              </span>
            </Well>
          )}
          {totals.totalM3 > 0 && <MaxIskInput value={maxIsk} onChange={onChangeMaxIsk} />}
          {totals.totalM3 > 0 && (
            <p className="text-text-dim">
              {t(
                state.haulerSizing === 'unavailable'
                  ? 'assets.movePlan.haulerSizingUnavailable'
                  : state.haulerSizing === 'loading'
                    ? 'assets.movePlan.haulerSizingLoading'
                    : 'assets.movePlan.noHauler'
              )}
            </p>
          )}
        </>
      )}
      {totals.totalM3 > 0 && (
        <HaulerPicker
          plan={plan}
          override={haulerOverride}
          onPick={onPickHauler}
          ownedFirst={ownedFirst}
          onOwnedFirstChange={setOwnedFirst}
          expanded={compareOpen}
          onToggleExpanded={onToggleCompare}
          tripsOf={(o) => withShips(o.trips, o.tooBigCount)}
        />
      )}
      {totals.totalM3 > 0 && (
        <>
          {maxIsk !== null && state.pricesUnavailable && (
            <p className="m-0 text-sm font-semibold text-warning">
              {t('assets.movePlan.pricesUnavailable')}
            </p>
          )}
          {maxIsk !== null && !state.pricesUnavailable && totals.unpricedCount > 0 && (
            <p className="m-0 text-sm font-semibold text-warning">
              {t('assets.movePlan.unpricedNote', { count: totals.unpricedCount })}
            </p>
          )}
        </>
      )}
      {active && tooBig > 0 && (
        <p className="m-0 text-sm font-semibold text-warning">
          {t('assets.movePlan.tooBigWarning', { hull: haulerName(active.hull), count: tooBig })}
        </p>
      )}
      {active && active.unfitCount > 0 && (
        <p className="m-0 text-sm font-semibold text-warning">
          {t('assets.movePlan.unfitWarning', {
            hull: haulerName(active.hull),
            count: active.unfitCount,
          })}
        </p>
      )}
      {active && active.overLimitCount > 0 && (
        <p className="m-0 text-sm font-semibold text-warning">
          {t('assets.movePlan.overLimitWarning', { count: active.overLimitCount })}
        </p>
      )}
      {flown.length > 0 && (
        <section
          aria-label={t('assets.movePlan.flyingHeading')}
          className="rounded-xs border border-line bg-panel-2"
        >
          <div className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
            <Eyebrow as="h3">{t('assets.movePlan.flyingHeading')}</Eyebrow>
            <span className="text-xs text-text-dim tabular-nums">
              {t('assets.movePlan.shipFlightCount', { count: flown.length })}
            </span>
          </div>
          <div className="overflow-hidden">
            <ul className="m-0 -mb-px grid list-none grid-cols-1 gap-x-8 px-3 pt-1 sm:grid-cols-2">
              {flownShips.map(({ ship, pickupKey }) => (
                <li
                  key={ship.itemId}
                  className="flex items-center gap-3 border-b border-line py-1.5"
                >
                  <span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">
                    {name(ship.typeId)}
                  </span>
                  <span className="text-xs font-semibold text-warning">
                    {t('assets.movePlan.flyIt')}
                  </span>
                  {canPack(ship.typeId) && (
                    <Button
                      size="sm"
                      onClick={() => askToPack(ship.itemId, ship.typeId, pickupKey)}
                    >
                      {t('assets.movePlan.packInstead')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <div className="flex flex-1 flex-col gap-3 rounded-xs border border-line bg-panel p-3">
        <dl className="m-0 flex flex-wrap gap-x-6 gap-y-1.5">
          <Stat
            label={t('assets.movePlan.volume')}
            value={`${formatCubicMetres(totals.totalM3)} m³`}
          />
          <Stat label={t('assets.movePlan.stacks')} value={formatCount(totals.stacks)} />
          {totals.characters > 1 && (
            <Stat
              label={t('assets.movePlan.characters', { count: totals.characters })}
              value={String(totals.characters)}
            />
          )}
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
              {c.pickups.map((p) => {
                const hauled = active?.pickups.find(
                  (h) => h.characterId === c.characterId && h.locationId === p.locationId
                );
                return (
                  <RailStop key={p.locationId} hue={hueOf(p.locationId)}>
                    <section className="rounded-xs border border-line bg-panel-2 px-3 pb-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line pt-2.5 pb-1.5">
                        <h3
                          data-pickup-heading={`${c.characterId}:${p.locationId}`}
                          tabIndex={-1}
                          className="m-0 flex min-w-0 flex-[1_1_12em] flex-wrap max-sm:contents items-baseline gap-x-3 gap-y-0.5 text-sm focus:outline-none"
                        >
                          <span className="min-w-0 flex-1 font-bold max-sm:basis-full [overflow-wrap:anywhere]">
                            <PlaceName locationId={p.locationId} name={placeLabel(p.locationId)} />
                          </span>
                          <span className="font-bold tabular-nums">
                            {formatCubicMetres(p.totalM3)} m³
                          </span>
                        </h3>
                      </div>
                      {totals.totalM3 > 0 && capacity > 0 && (
                        <p className="m-0 pt-1.5 text-xs text-text-dim tabular-nums">
                          {t(
                            hauled
                              ? 'assets.movePlan.shareOfLoadHauls'
                              : 'assets.movePlan.shareOfLoad',
                            {
                              percent: Math.round((p.totalM3 / totals.totalM3) * 100),
                              count: hauled?.hauls.length ?? 0,
                            }
                          )}
                        </p>
                      )}
                      {hauled && <PickupHaulList pickup={hauled} name={name} />}
                      <ul className="m-0 flex list-none flex-col p-0">
                        {!hauled &&
                          p.lines.map((l) => (
                            <PlanLine
                              key={l.typeId}
                              name={name(l.typeId)}
                              qty={`× ${formatCount(l.quantity)}`}
                              trailing={l.m3 !== null ? `${formatCubicMetres(l.m3)} m³` : null}
                            />
                          ))}
                        {p.unknownVolume.map((u) => (
                          <PlanLine
                            key={`unknown-${u.typeId}`}
                            name={name(u.typeId)}
                            qty={`× ${formatCount(u.quantity)}`}
                            trailing={t('assets.movePlan.volumeUnknown')}
                            dim
                          />
                        ))}
                        {p.packed.map((s) => (
                          <PlanLine
                            key={s.itemId}
                            name={name(s.typeId)}
                            qty={
                              <span className="text-text-dim">{t('assets.movePlan.packed')}</span>
                            }
                            trailing={
                              <Button
                                size="sm"
                                aria-label={t('assets.movePlan.flyInsteadAria', {
                                  ship: name(s.typeId),
                                })}
                                onClick={() => onUnpackShip(s.itemId)}
                              >
                                {t('assets.movePlan.flyInstead')}
                              </Button>
                            }
                          />
                        ))}
                      </ul>
                    </section>
                  </RailStop>
                );
              })}
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
        {routeFailed && <p className="m-0 text-text-dim">{t('assets.movePlan.routeFailed')}</p>}
        <div className="sticky bottom-0 mt-auto -mx-3 -mb-3 flex justify-end gap-2 border-t border-line bg-panel px-3 pt-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]">
          <Button variant="ghost" onClick={onBack}>
            {t('assets.movePlan.back')}
          </Button>
          {onShowRoute && (active || totals.shipsToFly > 0) && destinationSystem !== null && (
            <Button loading={routing} onClick={onShowRoute}>
              {t('assets.movePlan.showRoute')}
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={t('assets.movePlan.packTitle', { ship: asking ? name(asking.typeId) : '' })}
        body={t('assets.movePlan.packRigWarning', { count: asking?.rigs ?? 0 })}
        actionLabel={t('assets.movePlan.packAnyway')}
        cancelLabel={t('assets.movePlan.cancel')}
        returnFocusFallback={() => firstConnected([pickupHeading])}
        onConfirm={async () => {
          if (!asking) return;
          if (dontRemind) void setSkipRigWarning(true);
          onPackShip(asking.itemId);
          focusAfterCommit(pickupHeading);
        }}
      >
        <label
          className={`mt-3 flex cursor-pointer items-center gap-2 text-xs ${tappableRowClassName}`}
        >
          <Checkbox checked={dontRemind} onChange={(e) => setDontRemind(e.target.checked)} />
          {t('assets.movePlan.dontRemind')}
        </label>
      </ConfirmDialog>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-xs tracking-widest text-text-dim uppercase">{label}</dt>
      <dd className="m-0 text-base font-bold tabular-nums">{value}</dd>
    </div>
  );
}
