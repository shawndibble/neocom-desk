import { formatList } from '@/lib/listFormat';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { useMediaQuery, useTouchContext } from '@/lib/useMediaQuery';
import type { PlanAdvice } from '../planAdviceModel';
import { cardPlanetCount, whatIfChainsOf, whatIfKey, whatIfTypesOf } from '../biggerChainsModel';
import { usePiSettings } from '../piSettings';
import { NO_WHAT_IF_CHAINS, type WhatIfChainsState } from '../useBiggerChains';
import type { ChainEstimateOf } from '../useChainEstimates';
import { planPicks } from '../planPicks';
import {
  hrefWithout,
  hrefWithoutPiPlanet,
  hrefWithoutPiProduct,
  parsePiPlanet,
  parsePiProduct,
  PI_PLANET_PARAM,
  PI_PRODUCT_PARAM,
  piProductHref,
  productNavigation,
} from '../piPlanLink';
import { usePlanPreference } from '../planTicksPref';
import {
  canMake,
  detailMode,
  productFigure,
  tileChainIsk,
  traceProduct,
  unlockedBy,
  unlockedRecipe,
  type ProductFigure,
} from './mapModel';
import { planetName, verdictGlyph } from './mapText';
import type { PlanMapProps } from './PlanMap';

const PHONE_QUERY = '(max-width: 47.99rem)';
const NO_CHAINS: ChainEstimateOf = () => null;

type DetailKind = 'product' | 'planet';

export type PlanMapState = ReturnType<typeof usePlanMapState>;

export function usePlanMapState({
  graph,
  advice,
  adviceWithWhatIf,
  colonies,
  finder,
  pricesFailed = false,
  chainOf = NO_CHAINS,
  pi = null,
}: PlanMapProps) {
  const { t } = useTranslation();
  const phone = useMediaQuery(PHONE_QUERY);
  const context = useTouchContext();
  const location = useLocation();
  const navigate = useNavigate();

  const linkedRaw = parsePiProduct(location.search);
  const linked = linkedRaw !== null && graph.byId.has(linkedRaw) ? linkedRaw : null;
  const hasProductParam =
    linkedRaw !== null || new URLSearchParams(location.search).has(PI_PRODUCT_PARAM);

  const owned = useMemo(() => new Set(colonies.map((c) => c.type)), [colonies]);
  const colonyNames = useMemo(() => {
    const map = new Map<PlanetType, string[]>();
    for (const c of colonies) map.set(c.type, [...(map.get(c.type) ?? []), c.name]);
    return map;
  }, [colonies]);
  const noColonies = owned.size === 0;
  const isHave = useCallback(
    (type: PlanetType) => noColonies || owned.has(type),
    [noColonies, owned]
  );

  const picks = useMemo(() => planPicks(advice), [advice]);
  const preference = usePlanPreference((state) => state.value);
  const pickRanks = useMemo(() => new Map(picks.picks.map((p, i) => [p.typeId, i + 1])), [picks]);
  const pickPlanets = useMemo(() => {
    const map = new Map<PlanetType, number[]>();
    picks.picks.forEach((p, i) => {
      for (const type of p.planetTypes) map.set(type, [...(map.get(type) ?? []), i + 1]);
    });
    return map;
  }, [picks]);

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
  const [userTraced, setUserTraced] = useState<Traced | undefined>(
    linked !== null ? { id: linked, explicit: true } : undefined
  );
  const [whatIfTicks, setWhatIfTicks] = useState<ReadonlySet<PlanetType>>(new Set());
  const whatIfTypes = useMemo(
    () => whatIfTypesOf(whatIfKey([...whatIfTicks].filter((type) => !isHave(type)))),
    [whatIfTicks, isHave]
  );
  const whatIf = useMemo<ReadonlySet<PlanetType>>(() => new Set(whatIfTypes), [whatIfTypes]);
  const [preview, setPreview] = useState<PlanetType | null>(null);
  const [detailKind, setDetailKind] = useState<DetailKind>('product');
  const [seenLinked, setSeenLinked] = useState(linked);
  if (linked !== seenLinked) {
    setSeenLinked(linked);
    if (linked !== null) {
      setUserTraced({ id: linked, explicit: true });
      setDetailKind('product');
    }
  }
  const traced = useMemo<Traced>(
    () =>
      linked !== null
        ? { id: linked, explicit: true }
        : userTraced === undefined
          ? defaultTraced
          : userTraced,
    [linked, userTraced, defaultTraced]
  );
  const [planetOpen, setPlanetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const planetRaw = parsePiPlanet(location.search);
  const richnessColony = colonies.find((c) => c.planetId === planetRaw) ?? null;
  const hasPlanetParam = new URLSearchParams(location.search).has(PI_PLANET_PARAM);
  const dropProductParam = hasProductParam && (linked === null || richnessColony !== null);
  const dropPlanetParam = hasPlanetParam && richnessColony === null;
  useEffect(() => {
    const keys: string[] = [];
    if (dropProductParam) keys.push(PI_PRODUCT_PARAM);
    if (dropPlanetParam) keys.push(PI_PLANET_PARAM);
    if (keys.length === 0) return;
    navigate(hrefWithout(location, keys), { replace: true, state: location.state });
  }, [dropProductParam, dropPlanetParam, location, navigate]);
  const dropPlanet = () =>
    navigate(hrefWithoutPiPlanet(location), { replace: true, state: location.state });

  const layoutRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const [measured, setMeasured] = useState(false);
  useLayoutEffect(() => {
    const width = layoutRef.current?.getBoundingClientRect().width ?? 0;
    if (width > 0) setPanelWidth(width);
    setMeasured(true);
  }, []);
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

  const returnFocus = useRef<HTMLElement | null>(null);
  const remember = useCallback(() => {
    const active = document.activeElement;
    returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, []);
  const restoring = useRef<HTMLElement | null>(null);
  const restore = useCallback(() => {
    const el = returnFocus.current;
    returnFocus.current = null;
    if (!el || !el.isConnected) return;
    restoring.current = el;
    requestAnimationFrame(() => {
      restoring.current = null;
      el.focus();
    });
  }, []);
  const closePlanet = useCallback(() => {
    setPlanetOpen(false);
    restore();
  }, [restore]);
  const dropProduct = useCallback(() => {
    if (parsePiProduct(location.search) === null) return;
    navigate(hrefWithoutPiProduct(location), { replace: true });
  }, [location, navigate]);
  const lastLinked = useRef<number | null>(null);
  useEffect(() => {
    if (linked !== null) lastLinked.current = linked;
    else if (richnessColony !== null) lastLinked.current = null;
  }, [linked, richnessColony]);
  const productFocusFallback = useCallback((): HTMLElement | null => {
    if (restoring.current?.isConnected) return restoring.current;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      !active.closest('dialog, [role="dialog"]')
    ) {
      return active;
    }
    const id = lastLinked.current;
    const item =
      id === null
        ? null
        : (layoutRef.current?.querySelector<HTMLElement>(`[data-map-key="p:${id}"]`) ?? null);
    return item ?? document.querySelector<HTMLElement>('main h1[tabindex]');
  }, []);
  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    restore();
  }, [restore]);

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
  const needTypes = useMemo<ReadonlySet<PlanetType>>(
    () =>
      new Set(
        traced?.explicit && trace && !noColonies
          ? trace.planets.filter((p) => !p.have).map((p) => p.type)
          : []
      ),
    [traced, trace, noColonies]
  );
  const previewed = preview && !needTypes.has(preview) && !whatIf.has(preview) ? preview : null;
  const activeWhatIf = useMemo<ReadonlySet<PlanetType>>(
    () => (previewed ? new Set([previewed]) : whatIf),
    [previewed, whatIf]
  );
  const boardWhatIf = useMemo<ReadonlySet<PlanetType>>(
    () => new Set([...activeWhatIf].filter((type) => !isHave(type))),
    [activeWhatIf, isHave]
  );
  const litTicked = useMemo<ReadonlySet<PlanetType>>(
    () => (needTypes.size > 0 ? new Set([...ticked, ...needTypes]) : ticked),
    [ticked, needTypes]
  );
  const litIds = useMemo(
    () => new Set([...graph.byId.keys()].filter((id) => canMake(graph, id, litTicked))),
    [graph, litTicked]
  );
  const unlock = useMemo(
    () => (activeWhatIf.size > 0 ? unlockedBy(graph, activeWhatIf, ticked) : null),
    [graph, activeWhatIf, ticked]
  );
  const haulBetween = usePiSettings((state) => state.value.haulBetweenPlanets === true);
  const chainsOn = haulBetween && pi !== null && !pricesFailed;
  const whatIfChainKey = chainsOn && whatIfTypes.length > 0 ? whatIfKey(whatIfTypes) : null;
  const hasFreeSlot = advice.slots.free >= whatIfTypes.length;
  const [fed, setFed] = useState<{ advice: PlanAdvice; state: WhatIfChainsState } | null>(null);
  const whatIfChains = fed?.advice === advice ? fed.state : NO_WHAT_IF_CHAINS;
  const chainsPending = whatIfChainKey !== null && !whatIfChains.byType.has(whatIfChainKey);
  const whatIfCards = useMemo(
    () =>
      whatIfChainKey
        ? (whatIfChainsOf(advice, whatIfChains.byType).find((row) => row.key === whatIfChainKey)
            ?.cards ?? [])
        : [],
    [whatIfChainKey, whatIfChains.byType, advice]
  );
  const chainCards = useMemo(
    () => new Map(whatIfCards.map((card) => [card.typeId, card])),
    [whatIfCards]
  );
  const newIds = useMemo(() => {
    const ids = unlock?.highlight ?? new Set<number>();
    return previewed === null && chainCards.size > 0
      ? new Set([...ids, ...chainCards.keys()])
      : ids;
  }, [unlock, chainCards, previewed]);
  const figures = useMemo(
    () =>
      new Map<number, ProductFigure>(
        [...graph.byId.keys()].map((id) => {
          const figure = productFigure(advice, id, graph, pricesFailed);
          if (figure.kind !== 'unranked' || figure.reason !== 'tier') return [id, figure];
          const chain = chainOf(id);
          const card = chainCards.get(id);
          return [
            id,
            {
              ...figure,
              ...(chain ? { chain } : {}),
              ...(card && whatIfChainKey
                ? {
                    whatIf: {
                      types: whatIfTypes,
                      iskPerDay: card.iskPerDay,
                      planets: cardPlanetCount(card),
                    },
                  }
                : {}),
            },
          ];
        })
      ),
    [advice, graph, pricesFailed, chainOf, chainCards, whatIfChainKey, whatIfTypes]
  );
  const figureOf = useCallback((typeId: number) => figures.get(typeId)!, [figures]);
  const marks = useMemo(() => {
    const all = [...figures.values()];
    return {
      verdict: all.some((figure) => verdictGlyph(figure) !== null),
      estimate: all.some((figure) => tileChainIsk(figure) !== null),
    };
  }, [figures]);
  const colonySales = useMemo(
    () =>
      advice.colonies.map((c) => ({
        name: c.name ?? t('pi.planetLabel', { id: c.planetId }),
        sells: c.sells,
      })),
    [advice, t]
  );

  const [whatIfBuilt, setWhatIfBuilt] = useState<{
    types: ReadonlySet<PlanetType>;
    build: typeof adviceWithWhatIf;
    advice: PlanAdvice;
  } | null>(null);
  useEffect(() => {
    if (whatIf.size === 0) return;
    let live = true;
    Promise.resolve()
      .then(() => adviceWithWhatIf(whatIf))
      .then(
        (advice) => {
          if (live) setWhatIfBuilt({ types: whatIf, build: adviceWithWhatIf, advice });
        },
        () => {
          if (live) setWhatIfBuilt(null);
        }
      );
    return () => {
      live = false;
    };
  }, [whatIf, adviceWithWhatIf]);
  const whatIfAdvice =
    whatIf.size > 0 && whatIfBuilt?.types === whatIf && whatIfBuilt.build === adviceWithWhatIf
      ? whatIfBuilt.advice
      : null;
  const whatIfRecipe = useMemo(
    () => (whatIfAdvice ? unlockedRecipe(whatIfAdvice, whatIf, [...owned]) : null),
    [whatIf, whatIfAdvice, owned]
  );

  const showWhatIf = whatIf.size > 0 && (detailKind === 'planet' || traced === null);

  const [dockedLinked, setDockedLinked] = useState<number | null>(null);
  if (docked && linked !== null && dockedLinked !== linked) setDockedLinked(linked);
  if (linked === null && dockedLinked !== null) setDockedLinked(null);
  const staleOnNarrow = !docked && linked !== null && linked === dockedLinked;
  useEffect(() => {
    if (staleOnNarrow) navigate(hrefWithoutPiProduct(location), { replace: true });
  }, [staleOnNarrow, location, navigate]);
  const productShown =
    measured && !docked && linked !== null && !staleOnNarrow && detailKind === 'product';
  const planetShown = !docked && planetOpen;
  const richnessShown = measured && !docked && richnessColony !== null;
  const drawerShown = productShown || planetShown || richnessShown;
  const wasProductShown = useRef(productShown);
  useEffect(() => {
    if (wasProductShown.current && !productShown && !docked && !planetOpen && !helpOpen) restore();
    wasProductShown.current = productShown;
  }, [productShown, docked, planetOpen, helpOpen, restore]);

  const productHref = useCallback(
    (typeId: number) => piProductHref(typeId, location.search),
    [location.search]
  );
  const openProduct = (typeId: number) => {
    if (!docked && !drawerShown) remember();
    setUserTraced({ id: typeId, explicit: true });
    setDetailKind('product');
    const href = piProductHref(typeId, location.search);
    if (planetShown) {
      setPlanetOpen(false);
      navigate(href, { replace: true });
      return;
    }
    navigate(href, productNavigation(location));
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
    if (whatIfTicks.has(type)) {
      const next = new Set(whatIfTicks);
      next.delete(type);
      setWhatIfTicks(next);
      if (next.size === 0) closePlanet();
      return;
    }
    if (needTypes.has(type)) {
      if (!docked && !drawerShown) remember();
      setPlanetOpen(false);
      setDetailKind('product');
      if (linked === null && traced) {
        navigate(piProductHref(traced.id, location.search), productNavigation(location));
      }
      return;
    }
    if (!docked && !drawerShown) remember();
    if (richnessColony) dropPlanet();
    setWhatIfTicks(new Set([...whatIfTicks, type]));
    setDetailKind('planet');
    if (docked) return;
    if (linked !== null) {
      navigate(hrefWithoutPiProduct(location), {
        replace: true,
      });
    }
    setPlanetOpen(true);
  };
  const clearTrace = () => {
    setUserTraced(null);
    if (linked !== null) dropProduct();
    else restore();
  };
  const toggleProduct = (typeId: number) => {
    const ownTrace = traced?.explicit === true && traced.id === typeId;
    const panelElsewhere = docked && (richnessColony !== null || showWhatIf);
    if (ownTrace && !panelElsewhere) clearTrace();
    else openProduct(typeId);
  };

  const tracedProduct = traced ? graph.byId.get(traced.id) : null;
  const announce =
    traced?.explicit && tracedProduct && trace
      ? t('piMap.announceTrace', {
          name: tracedProduct.name,
          planets: trace.planets.map((p) => planetName(t, p.type)).join(' + '),
        })
      : linked === null && userTraced === null
        ? t('piMap.announceTraceCleared')
        : '';

  const detailTitle = richnessColony
    ? t('piMap.richness.title', { name: richnessColony.name })
    : showWhatIf
      ? t('piMap.add.panelTitleFor', {
          type: formatList(whatIfTypes.map((type) => planetName(t, type))),
          count: whatIfTypes.length,
        })
      : traced && tracedProduct
        ? t('piMap.detail.panelTitle', {
            name: tracedProduct.name,
            context: tracedProduct.tier === 0 ? 'raw' : undefined,
          })
        : t('piMap.detail.panelTitleEmpty');

  return {
    graph,
    advice,
    finder,
    pi,
    pricesFailed,
    context,
    phone,
    layoutRef,
    mode,
    docked,
    owned,
    noColonies,
    colonyNames,
    picks,
    preference,
    pickRanks,
    pickPlanets,
    ticked,
    litTicked,
    litIds,
    newIds,
    traced,
    trace,
    tracedProduct,
    needTypes,
    whatIf,
    whatIfTypes,
    whatIfAdvice,
    whatIfRecipe,
    whatIfCards,
    whatIfChainKey,
    activeWhatIf,
    boardWhatIf,
    previewed,
    unlock,
    showWhatIf,
    chainsOn,
    hasFreeSlot,
    chainsPending,
    setFed,
    setWhatIfTicks,
    setPreview,
    figureOf,
    marks,
    colonySales,
    richnessColony,
    productHref,
    clickPlanet,
    toggleProduct,
    openProduct,
    clearTrace,
    remember,
    dropPlanet,
    dropProduct,
    closePlanet,
    closeHelp,
    helpOpen,
    setHelpOpen,
    drawerShown,
    productShown,
    richnessShown,
    productFocusFallback,
    announce,
    detailTitle,
  };
}
