/**
 * The PI Map tab's body: the map panel (hint, "Your picks", the what-if line,
 * the board) and the detail panel beside or over it.
 *
 * Presentational over a `PlanAdvice`: it reads every figure from it (picks via
 * `planPicks`, per-product figures via `productFigure`) and never prices
 * anything. `useMapAdvice` builds the advice; tests hand one in.
 *
 * ## Where the detail panel goes
 *
 * By the map panel's *own* width, measured on the layout box that wraps both
 * the panel and the aside (a `ResizeObserver`, not the window): docked beside
 * the map at 1500px and up, a right-hand drawer below that, a bottom sheet on a
 * phone. The observed box is the same width docked or not, so docking never
 * changes the number it was decided on.
 */
import { AssumedCustomsNote } from '../AssumedCustomsNote';
import { assumedCustomsNames } from '../colonyCustoms';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel, Tooltip, TypeIcon } from '@/components/ui';
import {
  focusRingClassName,
  interactiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { cx } from '@/lib/cx';
import { clampIskZero, formatIsk, formatIskCompact, formatIskCompactSigned } from '@/lib/isk';
import { useMediaQuery, useTouchContext } from '@/lib/useMediaQuery';
import type { PlanAdvice } from '../planAdviceModel';
import { planPicks } from '../planPicks';
import { AddPlanetDetail, ProductDetail, type FinderOrigin } from './MapDetail';
import { MapBoard } from './MapBoard';
import { MapHelp } from './MapHelp';
import { MapPhone } from './MapPhone';
import { PiDrawer } from './PiDrawer';
import { PlanetImage } from './PlanetImage';
import { readMapHintDismissed, writeMapHintDismissed } from './mapHintPref';
import {
  canMake,
  detailMode,
  productFigure,
  traceProduct,
  unlockedBy,
  unlockedRecipe,
  type MapGraph,
  type ProductFigure,
} from './mapModel';
import { planetName } from './mapText';

const PHONE_QUERY = '(max-width: 47.99rem)';

export interface MapColony {
  type: PlanetType;
  name: string;
}

export interface PlanMapProps {
  graph: MapGraph;
  advice: PlanAdvice;
  /** The same advice with this planet type added as a what-if: priced for it, never for the picks. */
  adviceWithWhatIf: (type: PlanetType) => PlanAdvice;
  colonies: readonly MapColony[];
  finder: FinderOrigin;
}

type DetailKind = 'product' | 'planet';

export function PlanMap({ graph, advice, adviceWithWhatIf, colonies, finder }: PlanMapProps) {
  const { t } = useTranslation();
  const phone = useMediaQuery(PHONE_QUERY);
  const context = useTouchContext();

  const owned = useMemo(() => new Set(colonies.map((c) => c.type)), [colonies]);
  const colonyNames = useMemo(() => {
    const map = new Map<PlanetType, string[]>();
    for (const c of colonies) map.set(c.type, [...(map.get(c.type) ?? []), c.name]);
    return map;
  }, [colonies]);
  /** With no colony, every type is in play: the pilot unticks what they cannot reach. */
  const noColonies = owned.size === 0;
  const isHave = useCallback(
    (type: PlanetType) => noColonies || owned.has(type),
    [noColonies, owned]
  );

  const picks = useMemo(() => planPicks(advice), [advice]);
  const pickRanks = useMemo(() => new Map(picks.picks.map((p, i) => [p.typeId, i + 1])), [picks]);
  const pickPlanets = useMemo(() => {
    const map = new Map<PlanetType, number[]>();
    picks.picks.forEach((p, i) => {
      for (const type of p.planetTypes) map.set(type, [...(map.get(type) ?? []), i + 1]);
    });
    return map;
  }, [picks]);

  // --- State ---------------------------------------------------------------
  // The starting ticks and trace follow the data (colonies, picks) until the
  // pilot touches them; their own choice, once made, is never overridden.
  const defaultTicked = useMemo<ReadonlySet<PlanetType>>(
    () => new Set(noColonies ? graph.planetTypes : owned),
    [noColonies, graph, owned]
  );
  const [userTicked, setUserTicked] = useState<ReadonlySet<PlanetType> | null>(null);
  const ticked = userTicked ?? defaultTicked;
  type Traced = { id: number; explicit: boolean } | null;
  const defaultTraced = useMemo<Traced>(
    () => (picks.picks[0] ? { id: picks.picks[0].typeId, explicit: false } : null),
    [picks]
  );
  const [userTraced, setUserTraced] = useState<Traced | undefined>(undefined);
  const traced = userTraced === undefined ? defaultTraced : userTraced;
  const setTraced = setUserTraced;
  const [whatIf, setWhatIf] = useState<PlanetType | null>(null);
  const [preview, setPreview] = useState<PlanetType | null>(null);
  const [detailKind, setDetailKind] = useState<DetailKind>('product');
  const [detailOpen, setDetailOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(readMapHintDismissed);

  // --- Detail panel mode, by the layout box's own width -----------------------
  const layoutRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  useEffect(() => {
    const el = layoutRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setPanelWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const mode = detailMode({ panelWidth, phone });
  const docked = mode === 'docked';

  // --- Focus comes back to what opened the drawer ------------------------------
  const returnFocus = useRef<HTMLElement | null>(null);
  const remember = useCallback(() => {
    const active = document.activeElement;
    returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, []);
  const restore = useCallback(() => {
    const el = returnFocus.current;
    returnFocus.current = null;
    if (el && el.isConnected) requestAnimationFrame(() => el.focus());
  }, []);
  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    restore();
  }, [restore]);
  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    restore();
  }, [restore]);

  // --- Derived view ----------------------------------------------------------
  const activeWhatIf = preview ?? whatIf;
  const litIds = useMemo(
    () => new Set([...graph.byId.keys()].filter((id) => canMake(graph, id, ticked))),
    [graph, ticked]
  );
  const unlock = useMemo(
    () => (activeWhatIf ? unlockedBy(graph, activeWhatIf, ticked) : null),
    [graph, activeWhatIf, ticked]
  );
  const newIds = useMemo(() => unlock?.highlight ?? new Set<number>(), [unlock]);
  const trace = useMemo(
    () =>
      traced
        ? traceProduct(graph, traced.id, {
            owned,
            ticked,
            prefer: picks.picks.find((p) => p.typeId === traced.id)?.planetTypes,
          })
        : null,
    [graph, traced, owned, ticked, picks]
  );
  const figures = useMemo(
    () =>
      new Map<number, ProductFigure>(
        [...graph.byId.keys()].map((id) => [id, productFigure(advice, id, graph)])
      ),
    [advice, graph]
  );
  const figureOf = useCallback((typeId: number) => figures.get(typeId)!, [figures]);

  const whatIfAdvice = useMemo(
    () => (whatIf && !isHave(whatIf) ? adviceWithWhatIf(whatIf) : null),
    [whatIf, isHave, adviceWithWhatIf]
  );
  const whatIfRecipe = useMemo(
    () => (whatIf && whatIfAdvice ? unlockedRecipe(whatIfAdvice, whatIf, [...owned]) : null),
    [whatIf, whatIfAdvice, owned]
  );

  // --- Actions ---------------------------------------------------------------
  const drawerShown = !docked && detailOpen;
  const openProduct = (typeId: number) => {
    // Already in a drawer (the add-planet "best recipe" button): keep the
    // original opener as the place focus returns to.
    if (!docked && !drawerShown) remember();
    setTraced({ id: typeId, explicit: true });
    // Tracing a product answers the what-if question; board and panel agree.
    setWhatIf(null);
    setDetailKind('product');
    // Docked, the panel is always on screen: a flag set now would pop a stale
    // drawer open when the layout narrows.
    if (!docked) setDetailOpen(true);
  };
  const clickPlanet = (type: PlanetType) => {
    if (isHave(type)) {
      setUserTicked((current) => {
        const next = new Set(current ?? defaultTicked);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        return next;
      });
      return;
    }
    if (whatIf === type) {
      setWhatIf(null);
      closeDetail();
      return;
    }
    if (!docked && !drawerShown) remember();
    setWhatIf(type);
    setDetailKind('planet');
    if (!docked) setDetailOpen(true);
  };
  const dismissHint = () => {
    writeMapHintDismissed();
    setHintDismissed(true);
  };
  const clearTrace = () => {
    setTraced(null);
    closeDetail();
  };

  const tracedProduct = traced ? graph.byId.get(traced.id) : null;
  const announce =
    traced?.explicit && tracedProduct && trace
      ? t('piMap.announceTrace', {
          name: tracedProduct.name,
          planets: trace.planets.map((p) => planetName(t, p.type)).join(' + '),
        })
      : '';

  // --- Pieces ------------------------------------------------------------------
  const detailBody = (() => {
    if (detailKind === 'planet' && whatIf && whatIfAdvice) {
      const weakest = [...advice.colonies]
        .filter((c) => c.todayPerDay !== null)
        .sort((a, b) => a.todayPerDay! - b.todayPerDay!)[0];
      return (
        <AddPlanetDetail
          graph={graph}
          type={whatIf}
          unlockedIds={unlockedBy(graph, whatIf, ticked).productIds}
          recipe={whatIfRecipe}
          oneHostCount={
            whatIfAdvice.recipes.recipes.filter(
              (r) => r.hostTypes.includes(whatIf) && !r.hostTypes.some((h) => owned.has(h))
            ).length
          }
          slots={advice.slots}
          weakest={
            weakest
              ? {
                  name: weakest.name ?? t('pi.planetLabel', { id: weakest.planetId }),
                  perDay: weakest.todayPerDay!,
                }
              : null
          }
          finder={finder}
          onTraceRecipe={openProduct}
          onClose={() => {
            setWhatIf(null);
            closeDetail();
          }}
        />
      );
    }
    if (traced && trace) {
      const rank = pickRanks.get(traced.id) ?? null;
      const pick = picks.picks.find((p) => p.typeId === traced.id) ?? null;
      return (
        <ProductDetail
          graph={graph}
          typeId={traced.id}
          figure={figureOf(traced.id)}
          trace={trace}
          rank={rank}
          pickPerDay={pick?.perDay ?? null}
          pickKind={picks.kind}
          owned={owned}
          colonyNames={colonyNames}
          finder={finder}
          onClearTrace={clearTrace}
        />
      );
    }
    return <p className="text-xs text-text-dim">{t('piMap.detail.empty', { context })}</p>;
  })();
  const detailTitle =
    detailKind === 'planet' && whatIf
      ? t('piMap.add.panelTitleFor', { type: planetName(t, whatIf) })
      : traced && tracedProduct
        ? t('piMap.detail.panelTitle')
        : t('piMap.detail.panelTitleEmpty');

  const hint = !hintDismissed && (
    <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5 text-xs text-text-dim">
      <span>{t('piMap.hint', { context })}</span>
      <Button
        size={phone ? 'md' : 'sm'}
        className="shrink-0 whitespace-nowrap"
        onClick={dismissHint}
      >
        {t('piMap.hintDismiss')}
      </Button>
    </div>
  );

  const picksStrip = (
    <div
      role="group"
      aria-label={t('piMap.picksLabel')}
      className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-line px-3 py-1.5 text-xs"
    >
      <span className="text-[11px] font-semibold tracking-widest text-text-dim uppercase">
        {picks.kind === 'recipes' ? t('piMap.picksRecipes') : t('piMap.picksTitle')}
      </span>
      {picks.kind === 'none' ? (
        <span className="text-text-dim">{t('piMap.picksNone')}</span>
      ) : (
        <>
          {picks.picks.map((pick, i) => (
            <Tooltip
              key={pick.typeId}
              content={t('common.iskExact', { amount: formatIsk(pick.perDay, 0) })}
            >
              <button
                type="button"
                aria-current={traced?.id === pick.typeId ? 'true' : undefined}
                onClick={() => openProduct(pick.typeId)}
                className={cx(
                  'inline-flex h-7 items-center gap-1.5 rounded-xs border border-line px-2 text-xs max-md:h-11',
                  interactiveClassName,
                  focusRingClassName,
                  traced?.id === pick.typeId
                    ? selectedRowClassName
                    : '[@media(hover:hover)]:hover:border-line-bright [@media(hover:hover)]:hover:bg-panel-2'
                )}
              >
                <span className="text-[11px] font-bold text-warning">#{i + 1}</span>
                <TypeIcon typeId={pick.typeId} size={64} width={20} height={20} />
                <span>{pick.name}</span>
                <span
                  className={cx(
                    clampIskZero(pick.perDay, 0) < 0 ? 'text-isk-neg' : 'text-isk-pos',
                    'tabular-nums'
                  )}
                >
                  {picks.kind === 'rebuild'
                    ? formatIskCompactSigned(pick.perDay)
                    : formatIskCompact(pick.perDay)}
                  {t('piMap.perDaySuffix')}
                  {/* A button cannot hold a focusable IskAmount; the tooltip below and this text carry the exact figure. */}
                  <span className="sr-only">
                    {' '}
                    {t('common.iskExact', { amount: formatIsk(pick.perDay, 0) })}
                  </span>
                </span>
              </button>
            </Tooltip>
          ))}
          <span className="text-[11px] text-text-dim">
            {picks.kind === 'rebuild' ? t('piMap.picksNoteRebuild') : t('piMap.picksNoteRecipes')}
          </span>
        </>
      )}
      {traced && (
        <Button size={phone ? 'md' : 'sm'} className="ml-auto" onClick={clearTrace}>
          {t('piMap.clearTrace')}
        </Button>
      )}
    </div>
  );

  const missingTypes = graph.planetTypes.filter((type) => !isHave(type));
  const whatIfLine = (() => {
    const base =
      'flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line px-3 py-1.5 text-xs text-text-dim min-h-10';
    if (!activeWhatIf || !unlock) {
      return (
        <div className={base} aria-live="polite">
          <span className="text-[11px] font-semibold tracking-widest uppercase">
            {t('piMap.whatIfBlank')}
          </span>
          <span>
            {noColonies
              ? t('piMap.whatIfNoColonies')
              : missingTypes.length > 0
                ? t('piMap.whatIfHint', {
                    types: missingTypes.map((type) => planetName(t, type)).join(', '),
                    context,
                  })
                : t('piMap.whatIfAll')}
          </span>
        </div>
      );
    }
    const name = planetName(t, activeWhatIf);
    return (
      <div className={cx(base, 'text-text')} aria-live="polite">
        <PlanetImage type={activeWhatIf} size={28} />
        <span className="text-[11px] font-semibold tracking-widest text-map-whatif uppercase">
          {t('piMap.whatIfTitle', { type: name })}
        </span>
        <span>
          {unlock.productIds.length === 0
            ? t('piMap.whatIfNothing')
            : t('piMap.whatIfUnlocks', { count: unlock.productIds.length })}
          {whatIf === activeWhatIf && whatIfRecipe
            ? ` ${t('piMap.whatIfBest', { name: whatIfRecipe.name })}`
            : ''}
        </span>
        <span aria-hidden="true" className="flex flex-wrap gap-0.5">
          {unlock.productIds.slice(0, 12).map((id) => (
            <TypeIcon key={id} typeId={id} size={32} width={22} height={22} />
          ))}
        </span>
      </div>
    );
  })();

  const board = (
    <MapBoard
      graph={graph}
      owned={owned}
      noColonies={noColonies}
      ticked={ticked}
      litIds={litIds}
      newIds={newIds}
      whatIfType={activeWhatIf && !isHave(activeWhatIf) ? activeWhatIf : null}
      whatIfOpen={whatIf !== null}
      trace={trace}
      dimOthers={traced?.explicit ?? false}
      pickRanks={pickRanks}
      pickPlanets={pickPlanets}
      colonyNames={colonyNames}
      figureOf={figureOf}
      onPlanet={clickPlanet}
      onPreview={setPreview}
      onProduct={openProduct}
    />
  );

  return (
    <>
      <div
        ref={layoutRef}
        data-detail-mode={mode}
        className={cx(
          'grid items-start gap-3',
          docked ? 'grid-cols-[minmax(0,1fr)_22.5rem]' : 'grid-cols-1'
        )}
      >
        <Panel
          title={t('piMap.title')}
          padded={false}
          actions={
            <Button
              size={phone ? 'md' : 'sm'}
              aria-haspopup="dialog"
              onClick={() => {
                remember();
                setHelpOpen(true);
              }}
            >
              {t('piMap.helpButton')}
            </Button>
          }
        >
          {hint}
          <AssumedCustomsNote
            className="border-b border-line px-3 py-1.5"
            names={assumedCustomsNames(advice.colonies, (id) => t('pi.planetLabel', { id }))}
          />
          {picksStrip}
          {phone ? null : whatIfLine}
          {phone ? (
            <MapPhone
              graph={graph}
              owned={owned}
              noColonies={noColonies}
              ticked={ticked}
              whatIfType={whatIf}
              litIds={litIds}
              newIds={newIds}
              tracedId={traced?.id ?? null}
              pickRanks={pickRanks}
              figureOf={figureOf}
              onPlanet={clickPlanet}
              onProduct={openProduct}
              between={<div className="-mx-3 border-y border-line">{whatIfLine}</div>}
              fullMap={board}
            />
          ) : (
            board
          )}
        </Panel>
        {docked && (
          <aside aria-label={detailTitle} className="sticky top-3">
            <Panel title={detailTitle}>{detailBody}</Panel>
          </aside>
        )}
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>

      <PiDrawer
        open={!docked && detailOpen}
        onClose={closeDetail}
        title={detailTitle}
        phone={phone}
      >
        {detailBody}
      </PiDrawer>
      <PiDrawer open={helpOpen} onClose={closeHelp} title={t('piMap.help.title')} phone={phone}>
        <MapHelp />
      </PiDrawer>
    </>
  );
}
