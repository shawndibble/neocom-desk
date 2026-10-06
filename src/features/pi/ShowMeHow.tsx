/**
 * "Show me how": the three steps that open directly under a recipe card.
 * 1. find a planet (the nearest systems with the type), 2. build these pins,
 * 3. run it. Every figure comes from the recommendation model's layout
 * (`buildHowTo`), the system list from the SDE planet finder.
 *
 * Cues follow DESIGN.md §6c: item names open their PI Product Detail
 * (`PiProductLink`), system names are
 * Route Safety links with the security colour plus its number, "Highsec only"
 * is a checkbox, and the panel takes focus when it opens.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, IskAmount, TypeIcon } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { RecipeRank } from '@/engine/pi/planRecipes';
import { securityBand, securityStatusColor, shownSecurity } from '@/engine/securityStatus';
import { SystemLink } from '@/features/entities';
import { PiProductLink } from './PiProductLink';
import { Sentence } from './sentence';
import type { PiData } from '@/sde/types';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { LoadMeter, EstimateBadge, SectionLabel } from './DirectiveRow';
import { buildHowTo, type HowTo } from './findBestHowTo';
import { defaultHighsecOnly, needsSkyhookNote } from './findBestView';
import { withArticle } from './article';
import { PlanetImage } from './PlanetImage';
import { usePlanetFinder, type FinderOrigin, type FoundSystem } from './usePlanetFinder';

export interface OwnedColony {
  name: string;
  type: PlanetType;
}

interface Props {
  id: string;
  recipe: RecipeRank;
  pi: PiData;
  origin: FinderOrigin;
  /** The pilot's colonies on a planet type that hosts this recipe. */
  mine: readonly OwnedColony[];
  hubName: string;
  buybackPct: number | null;
  restartDays: number;
  estimate: boolean;
  /** The Highsec only box: null follows the origin's security. Kept by the parent across cards. */
  highsecPick: boolean | null;
  onHighsecPick: (value: boolean) => void;
  onClose: () => void;
}

function useTypeName() {
  const { t } = useTranslation();
  return (type: PlanetType) => t(`pi.planetType.${type}`);
}

function ItemName({ typeId, name }: { typeId: number; name: string }) {
  return (
    <PiProductLink typeId={typeId}>
      <b className="font-semibold">{name}</b>
    </PiProductLink>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-2 p-3">
      <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {n} · {title}
      </h3>
      {children}
    </div>
  );
}

function SystemRow({
  system,
  typeName,
}: {
  system: FoundSystem;
  typeName: (t: PlanetType) => string;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2 text-xs">
      <SystemLink systemId={system.systemId} className="font-semibold">
        {system.name ?? t('piPlan.find.system', { id: system.systemId })}
      </SystemLink>
      <span className="text-text-dim">
        {system.jumps === 0
          ? t('piPlan.find.here')
          : t('piPlan.find.jumps', { count: system.jumps })}
      </span>
      {system.security !== undefined && (
        <span
          className="ml-auto tabular-nums"
          style={{ color: securityStatusColor(system.security) }}
        >
          {shownSecurity(system.security).toFixed(1)}{' '}
          <span className="text-text-dim">
            {t(`piPlan.find.band.${securityBand(system.security)}`)}
          </span>
        </span>
      )}
      <span className="flex basis-full flex-wrap items-center gap-x-2 text-text-dim">
        {(Object.entries(system.planetCounts) as [PlanetType, number][]).map(([type, count]) => (
          <span key={type} className="inline-flex items-center gap-1">
            <PlanetImage type={type} size={16} />
            {typeName(type)} ×{count}
          </span>
        ))}
      </span>
    </li>
  );
}

function FindStep({
  recipe,
  origin,
  mine,
  highsecPick,
  onHighsecPick,
}: Pick<Props, 'recipe' | 'origin' | 'mine' | 'highsecPick' | 'onHighsecPick'>) {
  const { t } = useTranslation();
  const typeName = useTypeName();
  const highsecOnly = highsecPick ?? defaultHighsecOnly(origin.security);
  const state = usePlanetFinder({
    originSystemId: origin.systemId,
    types: recipe.hostTypes,
    highsecOnly,
  });
  const types = recipe.hostTypes.map(typeName).join(` ${t('piPlan.find.or')} `);
  const skyhook =
    needsSkyhookNote(origin.security) ||
    (state.status === 'ready' && state.systems.some((s) => needsSkyhookNote(s.security)));

  return (
    <Step n={1} title={t('piPlan.find.stepFind', { types })}>
      {mine.length > 0 ? (
        <p className="text-xs text-text">
          <span className="inline-flex items-center gap-1 text-success">
            <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" />
            {t('piPlan.find.haveOne')}
          </span>{' '}
          {mine.map((colony) => colony.name).join(', ')}. {t('piPlan.find.haveOneHint')}
        </p>
      ) : (
        <p className="text-xs text-text-dim">{t('piPlan.find.haveNone')}</p>
      )}
      {origin.status === 'unknown' ? (
        <p className="text-xs text-text-dim">{t('piPlan.find.noOrigin')}</p>
      ) : (
        <>
          <label className={`flex items-center gap-1.5 text-xs ${tappableRowClassName}`}>
            <Checkbox
              checked={highsecOnly}
              onChange={(event) => onHighsecPick(event.target.checked)}
            />
            {t('piPlan.find.highsecOnly')}
          </label>
          <div aria-live="polite">
            {state.status === 'loading' ? (
              <p className="text-xs text-text-dim">{t('common.loading')}</p>
            ) : state.status === 'failed' ? (
              <p className="text-xs text-text-dim">{t('piPlan.find.failed')}</p>
            ) : state.systems.length === 0 ? (
              <p className="text-xs text-text-dim">
                {t(highsecOnly ? 'piPlan.find.noneHighsec' : 'piPlan.find.none')}
              </p>
            ) : (
              <>
                <p className="text-[0.6875rem] text-text-dim">
                  {t('piPlan.find.nearest', { origin: origin.name ?? t('piPlan.find.you') })}
                </p>
                <ul className="divide-y divide-line border-t border-line">
                  {state.systems.map((system) => (
                    <SystemRow key={system.systemId} system={system} typeName={typeName} />
                  ))}
                </ul>
              </>
            )}
          </div>
          {skyhook && (
            <p className="flex items-start gap-1.5 text-xs text-text-dim">
              <Icon.PiSkyhook
                size={Icon.ICON_SIZE.sm}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />
              {t('piPlan.find.nullsecNote')}
            </p>
          )}
        </>
      )}
    </Step>
  );
}

function PinLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 py-1.5 text-xs">
      <span className="flex size-5 shrink-0 items-center justify-center text-text-dim">{icon}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function joinNames(items: readonly { typeId: number; name: string }[]): ReactNode {
  return items.map((item, i) => (
    <span key={item.typeId}>
      {i > 0 && ', '}
      <ItemName typeId={item.typeId} name={item.name} />
    </span>
  ));
}

function BuildStep({ how }: { how: HowTo }) {
  const { t } = useTranslation();
  const icon = (typeId: number) => <TypeIcon typeId={typeId} size={32} width={20} height={20} />;
  return (
    <Step n={2} title={t('piPlan.find.stepBuild')}>
      <ul className="divide-y divide-line border-y border-line">
        <PinLine icon={<Icon.PiCommandCenter size={Icon.ICON_SIZE.md} aria-hidden="true" />}>
          {t('piPlan.find.pinCommandCenter')}
        </PinLine>
        <PinLine icon={<Icon.PiLaunchpad size={Icon.ICON_SIZE.md} aria-hidden="true" />}>
          {t('piPlan.find.pinLaunchpad', { count: how.launchpads })}
        </PinLine>
        {how.extractors.map((extractor) => (
          <PinLine key={extractor.typeId} icon={icon(extractor.typeId)}>
            {t('piPlan.find.pinExtractor')}{' '}
            <ItemName typeId={extractor.typeId} name={extractor.name} />
          </PinLine>
        ))}
        {how.factories.map((line) => (
          <PinLine key={line.kind} icon={icon(line.makes[0].typeId)}>
            {t(`piPlan.find.pinFactory.${line.kind}`, { count: line.count })}{' '}
            {joinNames(line.makes)}
          </PinLine>
        ))}
        {how.storage > 0 && (
          <PinLine icon={<Icon.Container size={Icon.ICON_SIZE.md} aria-hidden="true" />}>
            {t('piPlan.find.pinStorage', { count: how.storage })}
          </PinLine>
        )}
      </ul>
      {how.fit && (
        <div className="space-y-1">
          <p className="text-[0.6875rem] text-text-dim">
            {t('piPlan.find.needsLevel', { level: how.fit.level })}
          </p>
          <LoadMeter
            label={t('piPlan.find.cpu')}
            used={how.fit.used.cpu}
            budget={how.fit.budget.cpu}
          />
          <LoadMeter
            label={t('piPlan.find.power')}
            used={how.fit.used.powergrid}
            budget={how.fit.budget.powergrid}
          />
        </div>
      )}
    </Step>
  );
}

function RunStep({
  recipe,
  how,
  hubName,
  buybackPct,
  restartDays,
  estimate,
}: Pick<Props, 'recipe' | 'hubName' | 'buybackPct' | 'restartDays' | 'estimate'> & { how: HowTo }) {
  const { t } = useTranslation();
  const rows: { icon: ReactNode; text: ReactNode }[] = [
    {
      icon: <Icon.Refresh size={Icon.ICON_SIZE.md} aria-hidden="true" />,
      text: t('piPlan.find.runReset', { count: restartDays }),
    },
    {
      icon: <Icon.Container size={Icon.ICON_SIZE.md} aria-hidden="true" />,
      text: (
        <Sentence
          text={t('piPlan.find.runCollect', {
            units: Math.round(how.unitsPerWeek).toLocaleString('en'),
            item: '{item}',
            m3: Math.round(how.m3PerWeek).toLocaleString('en'),
          })}
          slots={{ item: <PiProductLink typeId={recipe.typeId}>{recipe.name}</PiProductLink> }}
        />
      ),
    },
    {
      icon: <Icon.Route size={Icon.ICON_SIZE.md} aria-hidden="true" />,
      text:
        buybackPct === null
          ? t('piPlan.find.runSell', { hub: hubName })
          : t('piPlan.find.runBuyback', { pct: buybackPct }),
    },
    {
      icon: <TypeIcon typeId={recipe.typeId} size={32} width={20} height={20} />,
      text: (
        <>
          {t('piPlan.find.runEarns')}{' '}
          <span className="text-isk-pos">
            <IskAmount value={recipe.iskPerDay} decimals={0} />
            {t('piPlan.make.perDay')}
          </span>
        </>
      ),
    },
  ];
  return (
    <Step n={3} title={t('piPlan.find.stepRun')}>
      <ul className="divide-y divide-line border-y border-line">
        {rows.map((row, i) => (
          <PinLine key={i} icon={row.icon}>
            {row.text}
          </PinLine>
        ))}
      </ul>
      {estimate && <EstimateBadge />}
    </Step>
  );
}

export function ShowMeHow(props: Props) {
  const { t } = useTranslation();
  const { id, recipe, pi, onClose } = props;
  const mdUp = useMediaQuery('(min-width: 48rem)');
  const ref = useRef<HTMLElement>(null);
  // Opens under the tapped card: scroll it into view and move focus to it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView?.({ block: 'nearest' });
    el.focus({ preventScroll: true });
  }, []);
  const how = buildHowTo(recipe, pi);
  // Closing removes the focused panel: hand focus back to the card's button.
  const close = () => {
    const opener = document.querySelector<HTMLElement>(`[aria-controls="${id}"]`);
    onClose();
    opener?.focus();
  };
  return (
    <section
      ref={ref}
      id={id}
      tabIndex={-1}
      aria-label={t('piPlan.find.howLabel', { item: recipe.name })}
      className="border-t border-line bg-panel-2/40 outline-none"
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <TypeIcon typeId={recipe.typeId} size={32} width={20} height={20} />
        <SectionLabel>
          {t('piPlan.find.howTitle', {
            item: recipe.name,
            aType: withArticle(t(`pi.planetType.${recipe.useType}`)),
          })}
        </SectionLabel>
        <Button size={mdUp ? 'sm' : 'md'} className="ml-auto" onClick={close}>
          {t('piPlan.find.close')}
        </Button>
      </div>
      <div className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
        <FindStep
          recipe={recipe}
          origin={props.origin}
          mine={props.mine}
          highsecPick={props.highsecPick}
          onHighsecPick={props.onHighsecPick}
        />
        {how ? (
          <>
            <BuildStep how={how} />
            <RunStep {...props} how={how} />
          </>
        ) : (
          <p className="p-3 text-xs text-text-dim md:col-span-2">{t('piPlan.find.noLayout')}</p>
        )}
      </div>
    </section>
  );
}
