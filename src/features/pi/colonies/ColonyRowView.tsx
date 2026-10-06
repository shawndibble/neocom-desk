import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Button,
  Caret,
  InfoTooltip,
  MenuItem,
  RowActionsMenu,
  RowMoreActions,
  Tooltip,
  TypeIcon,
} from '@/components/ui';
import { IskAmount } from '@/components/ui';
import { RowTappableContext } from '@/components/ui/tooltipHold';
import { HintText } from '@/components/ui/HintText';
import { SystemLink } from '@/features/entities';
import { PiProductLink } from '../PiProductLink';
import { ShowInfoMenuItem, ViewInMarketMenuItem } from '@/features/market/ItemContextMenu';
import type { CharacterPlanet, CharacterPlanetDetail } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { groupFactoryPins } from '../adapters';
import {
  HOUR_MS,
  faultTagKey,
  type CheckStatus,
  type ColonyCheckRow,
  type FaultTag,
  type PrimaryAction,
} from './coloniesModel';
import { eveClock, hoursLabel, schematicOutputTypeId } from './coloniesFormat';
import { ColonyExpanded } from './ColonyExpanded';
import { planColonyHref } from './coloniesText';
import { PlanetImage } from '../PlanetImage';
import { StatusWord } from './TodayPanel';

const MICRO = 'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

function Meter({
  fraction,
  tone,
  rest,
}: {
  fraction: number | null;
  tone: 'success' | 'warning' | 'danger' | 'accent';
  /** The part of the track the colony loses to a stall, drawn as a faint fill after the bar. */
  rest?: 'stall';
}) {
  const fill = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    accent: 'bg-accent',
  }[tone];
  return (
    <span aria-hidden="true" className="flex h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
      {fraction !== null && (
        <span
          className={`block h-full ${fill}`}
          style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
        />
      )}
      {rest === 'stall' && fraction !== null && fraction < 1 && (
        <span className="block h-full flex-1 bg-danger/30" />
      )}
    </span>
  );
}

function LoadLine({ label, fraction }: { label: string; fraction: number | null }) {
  const { t } = useTranslation();
  const percent = fraction === null ? null : Math.round(fraction * 100);
  return (
    <div className="flex items-center gap-2 text-[0.6875rem]">
      <span className="w-12 shrink-0 font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </span>
      <div
        role="meter"
        aria-label={t('piColonies.loadMeter', { axis: label })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={percent === null ? t('piColonies.unknown') : `${percent}%`}
        className="min-w-0 flex-1"
      >
        <Meter
          fraction={fraction}
          tone={fraction !== null && fraction >= 0.9 ? 'warning' : 'accent'}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-text-dim tabular-nums">
        {percent === null ? '—' : `${percent}%`}
      </span>
    </div>
  );
}

/** A translated line whose `<isk/>` slot is an `IskAmount` (shorthand, exact on hover/focus/screen reader). */
function iskTrans(
  t: TFunction,
  i18nKey: string,
  values: Record<string, unknown>,
  value: number
): ReactNode {
  return (
    <Trans
      t={t}
      i18nKey={i18nKey}
      values={values}
      components={{ isk: <IskAmount value={value} decimals={0} /> }}
    />
  );
}

/**
 * `label` sits inside a Button, where a focusable `IskAmount` cannot go, so it
 * keeps shorthand and `labelGain` carries the figure for the exact reveal.
 * `note` is plain text and renders the figure as `IskAmount`.
 */
function actionText(
  action: PrimaryAction,
  t: TFunction
): { label: string; labelGain: number | null; note: ReactNode } {
  const gain = (value: number | null) => (value === null ? null : formatIskCompact(value));
  const perDay = t('piColonies.perDay');
  switch (action.kind) {
    case 'restart': {
      const g = gain(action.gainPerDay);
      return {
        labelGain: action.gainPerDay,
        label:
          g === null
            ? t('piColonies.action.restart')
            : t('piColonies.action.restartGain', { gain: g, perDay }),
        note: action.stopped
          ? t('piColonies.action.restartStoppedNote')
          : action.minutes !== null
            ? t('piColonies.action.inGame', { minutes: action.minutes })
            : t('piColonies.action.restartNote'),
      };
    }
    case 'restart-by': {
      return {
        label: t('piColonies.action.restartBy', { clock: eveClock(action.byMs) }),
        labelGain: null,
        note:
          action.keepsPerDay === null
            ? t('piColonies.action.restartByNote')
            : iskTrans(t, 'piColonies.action.keeps', { perDay }, action.keepsPerDay),
      };
    }
    case 'haul': {
      const g = gain(action.savesPerDay);
      return {
        labelGain: action.savesPerDay,
        label:
          g === null ? t('piColonies.action.haul') : t('piColonies.action.haulSaves', { gain: g }),
        note: t('piColonies.action.haulNote', { minutes: action.minutes }),
      };
    }
    case 'fix-factories': {
      const g = gain(action.gainPerDay);
      return {
        labelGain: action.gainPerDay,
        label:
          g === null
            ? t('piColonies.action.fixFactories', { count: action.count })
            : t('piColonies.action.fixFactoriesGain', { count: action.count, gain: g, perDay }),
        note: t('piColonies.action.smallFix', { minutes: action.minutes }),
      };
    }
    case 'add-extractors': {
      const g = gain(action.gainPerDay);
      return {
        labelGain: action.gainPerDay,
        label:
          g === null
            ? t('piColonies.action.addExtractors', { count: action.count })
            : t('piColonies.action.addExtractorsGain', { count: action.count, gain: g, perDay }),
        note: t('piColonies.action.smallFix', { minutes: action.minutes }),
      };
    }
    case 'add-factories': {
      const g = gain(action.gainPerDay);
      return {
        labelGain: action.gainPerDay,
        label:
          g === null
            ? t('piColonies.action.addFactories', { count: action.count })
            : t('piColonies.action.addFactoriesGain', { count: action.count, gain: g, perDay }),
        note: t('piColonies.action.smallFix', { minutes: action.minutes }),
      };
    }
    case 'details': {
      return {
        label: t('piColonies.action.details'),
        labelGain: null,
        note:
          action.perDay === null
            ? t('piColonies.action.detailsNote')
            : iskTrans(t, 'piColonies.action.allGood', { perDay }, action.perDay),
      };
    }
  }
}

function tagText(
  tag: FaultTag,
  planetName: string,
  t: TFunction
): { text: ReactNode; tone: string; hint?: string } {
  switch (tag.kind) {
    case 'slowed':
      return {
        text: t('piColonies.tag.slowed', {
          name: planetName,
          percent: Math.round(tag.fraction * 100),
        }),
        tone: 'border-warning/60 text-warning',
        hint: t('pi.yield.decayedTooltip'),
      };
    case 'storage':
      return {
        text: t('piColonies.tag.storage', { in: hoursLabel(tag.hoursToFull) }),
        tone: tag.urgent ? 'border-danger/60 text-danger' : 'border-warning/60 text-warning',
        hint: t('piColonies.help.storageTag'),
      };
    case 'idle-factories':
      return {
        text: t('piColonies.tag.idle', { count: tag.count }),
        tone: 'border-danger/60 text-danger',
        hint: t('piColonies.help.idleTag'),
      };
    case 'room-extractors':
      return {
        text:
          tag.gainPerDay === null
            ? t('piColonies.tag.roomExtractors', { count: tag.count })
            : iskTrans(
                t,
                'piColonies.tag.roomExtractorsGain',
                { count: tag.count, perDay: t('piColonies.perDay') },
                tag.gainPerDay
              ),
        tone: 'border-accent/60 text-accent',
      };
    case 'room-factories':
      return {
        text: t('piColonies.tag.roomFactories', { count: tag.count }),
        tone: 'border-accent/60 text-accent',
      };
    case 'stale':
      return {
        text: t('piColonies.tag.stale', { hours: Math.round(tag.hours) }),
        tone: 'border-warning/60 text-warning',
        hint: t('piColonies.help.staleTag'),
      };
  }
}

function FaultTags({ tags, planetName }: { tags: readonly FaultTag[]; planetName: string }) {
  const { t } = useTranslation();
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const { text, tone, hint } = tagText(tag, planetName, t);
        return (
          <li
            key={faultTagKey(tag)}
            className={`inline-flex min-h-[1.125rem] items-center gap-1 rounded-xs border px-1.5 text-[0.6875rem] ${tone}`}
          >
            {hint ? <HintText content={hint}>{text}</HintText> : text}
          </li>
        );
      })}
    </ul>
  );
}

export interface ColonyRowViewProps {
  row: ColonyCheckRow;
  planet: CharacterPlanet;
  detail: CharacterPlanetDetail | null;
  pi: PiData | null;
  nowMs: number;
  planetName: string;
  pinTypeNames: ReadonlyMap<number, string>;
  productNames: ReadonlyMap<number, string>;
  schematicNames: ReadonlyMap<number, string>;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
  /** The one filled button on the page: the first row, when its action is real. */
  primary: boolean;
  /** The active Character's colony: it has a Plan card to link to. */
  own: boolean;
  /** Another Character's colony: a menu entry that makes them the active Character. */
  switchTo?: { name: string; onSwitch: () => void };
  haulLabel: string;
}

const BUTTON_VARIANT: Record<CheckStatus, 'danger' | 'accent' | 'ghost'> = {
  stopped: 'danger',
  expiring: 'accent',
  'needs-look': 'accent',
  unknown: 'ghost',
  healthy: 'accent',
};

export function ColonyRowView(props: ColonyRowViewProps) {
  const { row, planet, detail, pi, nowMs, planetName, expanded } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();

  const rowId = `pi-colony-${row.characterId}-${row.planetId}`;
  const buttonId = `${rowId}-trigger`;
  const regionId = `${rowId}-region`;

  const pins = detail?.pins ?? [];
  const factoryGroups = groupFactoryPins(pins);
  const extractorProductId =
    pins.find((pin) => pin.extractor_details?.product_type_id !== undefined)?.extractor_details
      ?.product_type_id ?? null;
  const firstSchematic = factoryGroups[0]?.schematicId;
  const outputId =
    firstSchematic !== undefined && pi ? schematicOutputTypeId(firstSchematic, pi) : null;
  const shownProductId = outputId ?? extractorProductId;
  const productName =
    shownProductId === null
      ? null
      : (props.productNames.get(shownProductId) ??
        (firstSchematic !== undefined ? props.schematicNames.get(firstSchematic) : undefined) ??
        t('pi.unknownProduct'));

  const { extractor, storage, action } = row;
  const stopped = row.status === 'stopped';
  const extractorRight = (() => {
    if (extractor.expiryMs === null) return t('piColonies.noExtractors');
    if (stopped)
      return t('piColonies.stoppedAgo', {
        ago: hoursLabel((nowMs - extractor.expiryMs) / HOUR_MS),
      });
    return t('piColonies.timeLeft', { left: hoursLabel((extractor.expiryMs - nowMs) / HOUR_MS) });
  })();
  const extractorNote = (() => {
    if (extractor.expiryMs === null) return null;
    if (stopped) return t('piColonies.nothingExtracted');
    if (row.slowedToFraction !== null) {
      return t('piColonies.slowedTo', { percent: Math.round(row.slowedToFraction * 100) });
    }
    return t('piColonies.stopsAt', { clock: eveClock(extractor.expiryMs) });
  })();
  const extractorTone = stopped ? 'danger' : row.status === 'expiring' ? 'warning' : 'success';

  const storageRight =
    storage.hoursToFull === null
      ? t('piColonies.unknown')
      : storage.hoursToFull >= 336
        ? t('piColonies.overTwoWeeks')
        : hoursLabel(storage.hoursToFull);
  const storageNote =
    storage.hoursToFull === null
      ? t('piColonies.storageUnknown')
      : storage.fillsBeforeHaul
        ? t('piColonies.stalls', { span: hoursLabel(storage.stallHours) })
        : t('piColonies.afterHaul', { haul: props.haulLabel });
  const storageFraction =
    storage.hoursToFull === null
      ? null
      : storage.fillsBeforeHaul
        ? Math.max(0, storage.hoursToFull) / storage.haulHours
        : 1;

  const { label, labelGain, note } = actionText(action, t);
  const variant =
    action.kind === 'details'
      ? 'ghost'
      : props.primary && row.status !== 'stopped'
        ? 'primary'
        : BUTTON_VARIANT[row.status];

  const exactGain =
    labelGain === null ? null : t('common.iskExact', { amount: formatIsk(labelGain, 0) });
  const actionButton = (
    <Button size="md" variant={variant} className="w-full" onClick={props.onExpand}>
      {label}
      {exactGain && <span className="sr-only"> {exactGain}</span>}
    </Button>
  );
  const actionWithExact = exactGain ? (
    <Tooltip content={exactGain}>{actionButton}</Tooltip>
  ) : (
    actionButton
  );

  const toggleLabel = t('piColonies.toggleColony', { name: planetName });

  const menu = (
    <>
      <MenuItem onSelect={props.onToggle}>
        {expanded ? t('piColonies.menu.hide') : t('piColonies.menu.show')}
      </MenuItem>
      {props.own && (
        <MenuItem onSelect={() => navigate(planColonyHref(planetName, row.planetId))}>
          {t('piColonies.menu.plan')}
        </MenuItem>
      )}
      {props.switchTo && (
        <MenuItem onSelect={props.switchTo.onSwitch}>
          {t('pi.altColonies.switchTo', { name: props.switchTo.name })}
        </MenuItem>
      )}
      {/* The product name opens its PI detail (§6c "Entities", Overrides): Market and Show info move here. */}
      {shownProductId !== null && productName !== null && (
        <>
          <ViewInMarketMenuItem typeId={shownProductId} />
          <ShowInfoMenuItem typeId={shownProductId} itemName={productName} />
        </>
      )}
    </>
  );

  return (
    <div className="border-b border-line last:border-b-0" data-colony-status={row.status}>
      <RowActionsMenu name={planetName} items={menu}>
        <RowTappableContext.Provider value>
          <div
            // A pointer convenience: the real controls are the toggle button, the
            // action and the ⋮ menu. A click on a link or button inside is theirs.
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest('a, button:not([data-row-toggle]), input, [role="menuitem"]'))
                return;
              props.onToggle();
            }}
            className="relative grid cursor-pointer gap-x-4 gap-y-2 px-3 py-3 hover:bg-panel-2 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,1fr)_8.5rem_11rem_auto] md:items-start"
          >
            <div className="flex min-w-0 items-start gap-2.5 max-md:pr-11">
              <button
                type="button"
                id={buttonId}
                data-row-toggle
                aria-expanded={expanded}
                aria-controls={regionId}
                aria-label={toggleLabel}
                className="-m-1 inline-flex min-h-11 min-w-11 shrink-0 items-start justify-center rounded-xs p-1 pt-3 hover:bg-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:min-h-0 md:pt-2.5"
              >
                <Caret expanded={expanded} />
              </button>
              <PlanetImage type={row.planetType} size={40} />
              <div className="min-w-0 space-y-1">
                <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm leading-tight font-semibold">
                  <SystemLink systemId={row.systemId}>{planetName}</SystemLink>
                  <span className="text-xs font-normal">
                    <span className="mr-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                      {t('piColonies.statusLabel')}
                    </span>
                    <StatusWord status={row.status} />
                  </span>
                </h3>
                <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-dim">
                  {extractorProductId !== null && (
                    <TypeIcon typeId={extractorProductId} size={32} width={16} height={16} />
                  )}
                  {outputId !== null && (
                    <>
                      <span aria-hidden="true">→</span>
                      <TypeIcon typeId={outputId} size={32} width={16} height={16} />
                    </>
                  )}
                  <span className="min-w-0">
                    {shownProductId !== null && productName !== null ? (
                      <PiProductLink typeId={shownProductId}>{productName}</PiProductLink>
                    ) : (
                      t('piColonies.nothingMade')
                    )}
                  </span>
                  <span className="shrink-0 whitespace-nowrap">
                    {'· '}
                    {t(`pi.planetType.${row.planetType}`)}
                  </span>
                </p>
              </div>
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1 ${MICRO}`}>
                  {t('piColonies.extractors')}
                  <InfoTooltip
                    label={t('common.aboutLabel', { label: t('piColonies.extractors') })}
                    content={t('piColonies.help.extractors')}
                  />
                </span>
                <span
                  className={`text-xs font-semibold tabular-nums ${stopped ? 'text-danger' : row.status === 'expiring' ? 'text-warning' : 'text-text'}`}
                >
                  {extractorRight}
                </span>
              </div>
              <Meter fraction={stopped ? 1 : extractor.remainingFraction} tone={extractorTone} />
              {extractorNote && <p className="text-[0.6875rem] text-text-dim">{extractorNote}</p>}
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1 ${MICRO}`}>
                  {t('piColonies.storageFull')}
                  <InfoTooltip
                    label={t('common.aboutLabel', { label: t('piColonies.storageFull') })}
                    content={t('piColonies.help.storage', { hours: Math.round(storage.haulHours) })}
                  />
                </span>
                <span
                  className={`text-xs font-semibold tabular-nums ${storage.fillsBeforeHaul ? (storage.hoursToFull !== null && storage.hoursToFull < 24 ? 'text-danger' : 'text-warning') : 'text-text'}`}
                >
                  {storageRight}
                </span>
              </div>
              <Meter
                fraction={storageFraction}
                tone={
                  storage.fillsBeforeHaul
                    ? storage.hoursToFull !== null && storage.hoursToFull < 24
                      ? 'danger'
                      : 'warning'
                    : 'success'
                }
                rest="stall"
              />
              <p
                className={`text-[0.6875rem] ${storage.fillsBeforeHaul ? 'text-warning' : 'text-text-dim'}`}
              >
                {storageNote}
              </p>
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className={MICRO}>{t('piColonies.load')}</span>
                <span className="text-[0.6875rem] text-text-dim">
                  {t('piColonies.ccLevel', { level: row.load.ccLevel })}
                </span>
              </div>
              <LoadLine label={t('piColonies.cpu')} fraction={row.load.cpu} />
              <LoadLine label={t('piColonies.power')} fraction={row.load.power} />
            </div>

            <div className="flex min-w-0 flex-col gap-1 md:items-stretch">
              {actionWithExact}
              <p className="text-center text-[0.6875rem] text-text-dim">{note}</p>
            </div>

            <div className="flex justify-end max-md:absolute max-md:top-1 max-md:right-1 md:items-start">
              <RowMoreActions />
            </div>

            {row.tags.length > 0 && (
              <div className="md:col-span-6 md:col-start-1 md:pl-[4.6rem]">
                <FaultTags tags={row.tags} planetName={planetName} />
              </div>
            )}
          </div>
        </RowTappableContext.Provider>
      </RowActionsMenu>

      {expanded && (
        <div id={regionId} role="region" aria-labelledby={buttonId}>
          <ColonyExpanded
            row={row}
            planet={planet}
            detail={detail}
            pi={pi}
            nowMs={nowMs}
            pinTypeNames={props.pinTypeNames}
            productNames={props.productNames}
            schematicNames={props.schematicNames}
            planHref={props.own ? planColonyHref(planetName, row.planetId) : null}
            haulLabel={props.haulLabel}
          />
        </div>
      )}
    </div>
  );
}
