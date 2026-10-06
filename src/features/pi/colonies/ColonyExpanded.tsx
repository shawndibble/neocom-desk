import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { InfoTooltip, IskAmount, StatChip, TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { CharacterPlanet, CharacterPlanetDetail, PlanetPin } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { extractorState } from '@/engine/pi/colonyStatus';
import { isSaving } from '@/engine/pi/planAdvice';
import {
  extractorCycleYields,
  fractionOfPeak,
  hasYieldBaseline,
  programTotalYield,
  yieldBankedBy,
} from '@/engine/pi/extraction';
import type { ExtractorYieldProgram } from '@/engine/pi/types';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import {
  extractorExpiryMs,
  extractorProgramsFromPins,
  groupFactoryPins,
  pinRole,
} from '../adapters';
import { HOUR_MS, type ColonyCheckRow } from './coloniesModel';
import { eveClock, hoursLabel, schematicOutputTypeId } from './coloniesFormat';
import { quickWinLine } from './coloniesText';

const MICRO = 'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';
const DAY_MS = 86_400_000;

/** A day's output a reinstall would recover right now, from `engine/pi/extraction`'s own curve. */
function resetGainPerDay(program: ExtractorYieldProgram, nowMs: number): number {
  const peak = extractorCycleYields(program, 1)[0] ?? 0;
  const current = peak * fractionOfPeak(program, nowMs);
  return Math.max(0, (peak - current) * (DAY_MS / program.cycleTimeMs));
}

function Meter({
  fraction,
  tone,
}: {
  fraction: number | null;
  tone: 'accent' | 'warning' | 'danger';
}) {
  return (
    <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-full bg-panel">
      {fraction !== null && (
        <span
          className={`block h-full ${tone === 'danger' ? 'bg-danger' : tone === 'warning' ? 'bg-warning' : 'bg-accent'}`}
          style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
        />
      )}
    </span>
  );
}

function Section({
  icon,
  title,
  help,
  aside,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  help?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="min-w-0 space-y-2 p-3">
      <h4 className={`flex items-center gap-1.5 ${MICRO}`}>
        {icon}
        {title}
        {help && <InfoTooltip label={t('common.aboutLabel', { label: title })} content={help} />}
        {aside && <span className="ml-auto font-normal tracking-normal normal-case">{aside}</span>}
      </h4>
      {children}
    </section>
  );
}

interface ColonyExpandedProps {
  row: ColonyCheckRow;
  planet: CharacterPlanet;
  detail: CharacterPlanetDetail | null;
  pi: PiData | null;
  nowMs: number;
  pinTypeNames: ReadonlyMap<number, string>;
  productNames: ReadonlyMap<number, string>;
  schematicNames: ReadonlyMap<number, string>;
  /** Plan's link for this colony; absent for another Character's colony. */
  planHref: string | null;
  haulLabel: string;
}

export function ColonyExpanded({
  row,
  planet,
  detail,
  pi,
  nowMs,
  pinTypeNames,
  productNames,
  schematicNames,
  planHref,
  haulLabel,
}: ColonyExpandedProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const pins: readonly PlanetPin[] = detail?.pins ?? [];
  const typeNames = new Map([...pinTypeNames, ...productNames]);
  const programs = new Map<number, ExtractorYieldProgram>();
  for (const program of extractorProgramsFromPins(pins)) {
    if (hasYieldBaseline(program)) programs.set(program.pinId, program);
  }
  const extractors = pins.filter((pin) => pinRole(pin) === 'extractor');
  const factories = groupFactoryPins(pins);
  const { storage, load } = row;
  const fullIn =
    storage.hoursToFull === null
      ? null
      : storage.hoursToFull >= 336
        ? t('piColonies.overTwoWeeks')
        : hoursLabel(storage.hoursToFull);

  if (!detail || pins.length === 0) {
    return (
      <div className="border-t border-line bg-panel-2 p-3 text-xs text-text-dim">
        <p className="font-semibold text-text">{t('pi.noPinsTitle')}</p>
        <p>{t('pi.noPinsHint')}</p>
      </div>
    );
  }

  return (
    <div className="border-t border-line bg-panel-2">
      <div className="grid divide-line md:grid-cols-3 md:divide-x max-md:divide-y">
        <Section
          icon={<Icon.Extraction size={Icon.ICON_SIZE.sm} aria-hidden="true" />}
          title={t('piColonies.expanded.extractors')}
          help={t('piColonies.help.extractors')}
        >
          {extractors.length === 0 && (
            <p className="text-xs text-text-dim">{t('piColonies.expanded.noExtractors')}</p>
          )}
          {extractors.map((pin) => {
            const productId = pin.extractor_details?.product_type_id;
            const expiryMs = extractorExpiryMs(pin);
            const program = programs.get(pin.pin_id);
            const total = program ? programTotalYield(program) : 0;
            const banked = program && total > 0 ? yieldBankedBy(program, nowMs) : null;
            const stopped = expiryMs !== null && extractorState(expiryMs, nowMs) === 'expired';
            return (
              <div
                key={pin.pin_id}
                className="space-y-1 border-b border-line pb-2 last:border-b-0 last:pb-0"
              >
                <div className="flex items-center gap-2 text-xs">
                  {productId !== undefined && (
                    <TypeIcon typeId={productId} size={32} width={20} height={20} />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {productId !== undefined ? (
                      <MarketItemLink typeId={productId}>
                        {productNames.get(productId) ?? t('pi.unknownProduct')}
                      </MarketItemLink>
                    ) : (
                      t('pi.unknownProduct')
                    )}
                  </span>
                  <span className="shrink-0 text-text-dim">
                    {t('piColonies.expanded.heads', {
                      count: pin.extractor_details?.heads.length ?? 0,
                    })}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div>
                    <dt className={MICRO}>
                      {stopped ? t('piColonies.expanded.stopped') : t('piColonies.expanded.stops')}
                    </dt>
                    <dd className={`tabular-nums ${stopped ? 'text-danger' : ''}`}>
                      {expiryMs === null
                        ? '—'
                        : stopped
                          ? t('piColonies.ago', { ago: hoursLabel((nowMs - expiryMs) / HOUR_MS) })
                          : `${t('piColonies.today.in', { in: hoursLabel((expiryMs - nowMs) / HOUR_MS) })} · ${eveClock(expiryMs)}`}
                    </dd>
                  </div>
                  <div>
                    <dt className={MICRO}>{t('pi.yield.bankedColumn')}</dt>
                    <dd className="tabular-nums">
                      {banked === null
                        ? '—'
                        : t('pi.yield.bankedValue', {
                            amount: Math.round(banked).toLocaleString(),
                            percent: Math.round((banked / total) * 100),
                          })}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className={MICRO}>{t('pi.yield.resetGainColumn')}</dt>
                    <dd className="text-accent tabular-nums">
                      {program
                        ? t('pi.yield.resetGainValue', {
                            amount: Math.round(resetGainPerDay(program, nowMs)).toLocaleString(),
                          })
                        : '—'}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </Section>

        <Section
          icon={<Icon.Industry size={Icon.ICON_SIZE.sm} aria-hidden="true" />}
          title={t('piColonies.expanded.production')}
        >
          {factories.length === 0 && (
            <p className="text-xs text-text-dim">{t('piColonies.expanded.noFactories')}</p>
          )}
          {factories.map((group) => {
            const outputId =
              group.schematicId !== undefined && pi
                ? schematicOutputTypeId(group.schematicId, pi)
                : null;
            const name =
              group.schematicId !== undefined
                ? (schematicNames.get(group.schematicId) ?? t('pi.unknownSchematic'))
                : t('pi.unknownSchematic');
            return (
              <div key={String(group.schematicId)} className="flex items-center gap-2 text-xs">
                {outputId !== null && (
                  <TypeIcon typeId={outputId} size={32} width={20} height={20} />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {t('piColonies.expanded.factoryLine', { count: group.count })}{' '}
                  {outputId !== null ? (
                    <MarketItemLink typeId={outputId}>{name}</MarketItemLink>
                  ) : (
                    name
                  )}
                </span>
              </div>
            );
          })}
          {row.idleFactories > 0 && (
            <p className="text-xs text-danger">
              {t('piColonies.expanded.idle', { count: row.idleFactories })}
            </p>
          )}

          <h4 className={`flex items-center gap-1.5 pt-2 ${MICRO}`}>
            <Icon.Planetary size={Icon.ICON_SIZE.sm} aria-hidden="true" />
            {t('piColonies.expanded.commandCenter')}
            <span className="ml-auto font-normal tracking-normal normal-case">
              {t('piColonies.ccLevel', { level: load.ccLevel })}
            </span>
          </h4>
          {load.cpuUsed !== null &&
          load.cpuBudget !== null &&
          load.powerUsed !== null &&
          load.powerBudget !== null ? (
            <div className="space-y-1.5 text-xs">
              <div>
                <div className="flex justify-between text-text-dim">
                  <span>{t('piColonies.cpu')}</span>
                  <span className="tabular-nums">
                    {Math.round(load.cpuUsed).toLocaleString()} /{' '}
                    {Math.round(load.cpuBudget).toLocaleString()} tf
                  </span>
                </div>
                <Meter fraction={load.cpu} tone={(load.cpu ?? 0) >= 0.9 ? 'warning' : 'accent'} />
              </div>
              <div>
                <div className="flex justify-between text-text-dim">
                  <span>{t('piColonies.power')}</span>
                  <span className="tabular-nums">
                    {Math.round(load.powerUsed).toLocaleString()} /{' '}
                    {Math.round(load.powerBudget).toLocaleString()} MW
                  </span>
                </div>
                <Meter
                  fraction={load.power}
                  tone={(load.power ?? 0) >= 0.9 ? 'warning' : 'accent'}
                />
              </div>
              <p className="text-text-dim">
                {t('piColonies.expanded.free', {
                  cpu: Math.max(0, Math.round(load.cpuBudget - load.cpuUsed)).toLocaleString(),
                  power: Math.max(
                    0,
                    Math.round(load.powerBudget - load.powerUsed)
                  ).toLocaleString(),
                })}
              </p>
            </div>
          ) : (
            <p className="text-xs text-text-dim">{t('piColonies.expanded.loadUnknown')}</p>
          )}
        </Section>

        <Section
          icon={<Icon.Container size={Icon.ICON_SIZE.sm} aria-hidden="true" />}
          title={t('piColonies.expanded.launchpad')}
          help={t('piColonies.help.launchpad')}
          aside={
            storage.capacityM3 !== null
              ? t('piColonies.expanded.capacity', {
                  m3: Math.round(storage.capacityM3).toLocaleString(),
                })
              : undefined
          }
        >
          {storage.usedM3 !== null && storage.capacityM3 !== null && storage.capacityM3 > 0 ? (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className={MICRO}>{t('piColonies.expanded.used')}</span>
                <div className="flex-1">
                  <Meter
                    fraction={storage.usedM3 / storage.capacityM3}
                    tone={storage.fillsBeforeHaul ? 'warning' : 'accent'}
                  />
                </div>
                <span className="text-text-dim tabular-nums">
                  {Math.round((storage.usedM3 / storage.capacityM3) * 100)}%
                </span>
              </div>
              <p className="text-xs">
                {t('piColonies.expanded.usedLine', {
                  m3: Math.round(storage.usedM3).toLocaleString(),
                })}{' '}
                {fullIn === null
                  ? t('piColonies.expanded.fullUnknown')
                  : t('piColonies.expanded.fullIn', { in: fullIn, haul: haulLabel })}
              </p>
            </>
          ) : (
            <p className="text-xs text-text-dim">{t('piColonies.expanded.storageUnknown')}</p>
          )}
          <p className="flex items-center gap-1 text-xs text-text-dim">
            {t('piColonies.expanded.asOfOpened')}
            <InfoTooltip
              label={t('common.aboutLabel', { label: t('piColonies.expanded.launchpad') })}
              content={t('piColonies.help.asOfOpened')}
            />
          </p>
        </Section>
      </div>

      {row.quickWins.length > 0 && (
        <section className="space-y-1.5 border-t border-line p-3">
          <h4 className={`flex items-center justify-between gap-2 ${MICRO}`}>
            {t('piColonies.expanded.fixes')}
            <span className="font-normal tracking-normal normal-case">
              {t('piColonies.expanded.sameAsPlan')}
            </span>
          </h4>
          <ul className="divide-y divide-line">
            {row.quickWins.map((win) => {
              const line = quickWinLine(win, typeNames, t);
              return (
                <li key={win.id} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
                  <span className="inline-flex h-[1.125rem] shrink-0 items-center rounded-xs border border-accent/45 bg-accent/10 px-1.5 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
                    {t(`piColonies.fixVerb.${line.verb}`)}
                  </span>
                  <span className="min-w-0 flex-1">{line.text}</span>
                  <span
                    className={`shrink-0 tabular-nums ${isSaving(win.detail) ? 'text-warning' : 'text-isk-pos'}`}
                  >
                    {win.gainPerDay === null ? (
                      t('piColonies.noFigure')
                    ) : isSaving(win.detail) ? (
                      <>
                        {t('piColonies.saves')}
                        <IskAmount value={win.gainPerDay} decimals={0} />
                        {t('piColonies.perDay')}
                      </>
                    ) : (
                      <>
                        +<IskAmount value={win.gainPerDay} decimals={0} />
                        {t('piColonies.perDay')}
                      </>
                    )}
                    <span className="text-text-dim">
                      {' '}
                      · {t('piColonies.login.minutes', { minutes: win.minutes })}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line p-3 text-xs">
        {planHref && (
          <Link
            to={planHref}
            className={entityLinkClassName(
              'inline-flex min-h-11 items-center gap-1 font-semibold md:min-h-0'
            )}
          >
            {t('piColonies.expanded.planThis')}
            <Icon.Descend size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          </Link>
        )}
        {planHref && (
          <span className="min-w-0 flex-1 text-text-dim">
            {t('piColonies.expanded.planHint', { type: t(`pi.planetType.${planet.planet_type}`) })}
          </span>
        )}
        <StatChip
          label={t('pi.lastUpdate')}
          value={t('piColonies.expanded.lastUpdateValue', {
            local: formatTimestamp(new Date(planet.last_update), timeZone),
            eve: eveClock(Date.parse(planet.last_update)),
          })}
          tooltip={t('pi.lastUpdateTooltip')}
          className="ml-auto"
        />
      </div>
    </div>
  );
}
