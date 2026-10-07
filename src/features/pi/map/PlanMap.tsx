/**
 * The PI Map tab's body: the map panel (hint, "Your picks", the what-if line,
 * the board) and the detail panel beside or over it.
 *
 * Presentational over a `PlanAdvice`: it reads every figure from it (picks via
 * `planPicks`, per-product figures via `productFigure`), plus P3/P4 chain
 * estimates via `chainOf`. It prices only the ticked what-ifs' Bigger chains
 * (below). `useMapAdvice` builds the advice; tests hand one in.
 *
 * ## Where the detail panel goes
 *
 * By the map panel's *own* width, measured on the layout box that wraps both
 * the panel and the aside (a `ResizeObserver`, not the window): docked beside
 * the map at 1500px and up, a right-hand drawer below that, a bottom sheet on a
 * phone. The observed box is the same width docked or not, so docking never
 * changes the number it was decided on.
 *
 * ## The product drawer is the URL's `?product=`
 *
 * Tile clicks write it too, docked or not. An unknown id is dropped; so is one
 * linked while docked once the layout narrows, so no stale drawer pops open.
 * The "add a planet" drawer is local state with its own Back entry.
 *
 * `?planet=<id>` opens the richness override for one of the pilot's colonies
 * (the Colonies row links here); a product link drops it, one drawer at a time.
 *
 * ## Who owns what (one source of truth each)
 *
 * - **Planet ticks** (types the pilot has): `userTicked`, `null` until they
 *   touch one. Only a planet click changes it.
 * - **The what-if ticks** (any types they do not have, together): `whatIfTicks`.
 *   Only a planet click (or the add-planet panel's own Close) changes it: tracing, picking or
 *   clearing a product never does. A type the trace needs that is not ticked
 *   shows as NEED, drawn from the trace, never written into the ticks.
 * - **What-if Bigger chains**: only when the pilot hauls between planets
 *   (`piSettings.haulBetweenPlanets`) and a what-if is ticked (not hovered); the
 *   ticked set is priced as one, a new planet of each type.
 *   The P3/P4 tiles it makes possible light with their multi-planet estimate,
 *   and the add-planet panel lists them. Never a pick: the picks strip reads
 *   `advice` alone.
 * - **The trace**: the URL's `?product=` while it names one, else `userTraced`
 *   (`undefined` follows the first pick, `null` is cleared, else the pilot's
 *   pick). A tile, phone row or pick toggles it: a click on the product the
 *   pilot traced clears it, and the URL with it (Back if this page pushed it).
 * - **Closing the product drawer** (Back, Escape, Close) keeps the trace; only
 *   a toggle or "Clear trace" ends it. With no trace, the docked panel shows
 *   the what-if planet, if one is ticked.
 */
import { withArticle } from '../article';
import { AssumedCustomsNote } from '../AssumedCustomsNote';
import { assumedCustomsNames } from '../colonyCustoms';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { onPlanLinkClick } from '@/features/industry/planLinkClick';
import { clickOnSpace } from '@/lib/clickOnSpace';
import { Button, Panel, Spinner, Tooltip, TypeIcon } from '@/components/ui';
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
import type { PiData } from '@/sde/types';
import { cardPlanetCount, whatIfChainsOf, whatIfKey, whatIfTypesOf } from '../biggerChainsModel';
import { WhatIfChainCards } from '../BiggerChainsPanel';
import { usePiSettings } from '../piSettings';
import { NO_WHAT_IF_CHAINS, type WhatIfChainsState } from '../useBiggerChains';
import { WhatIfChainsFeed } from './WhatIfChainsFeed';
import type { ChainEstimateOf } from '../useChainEstimates';
import { CcLevelTag } from '../CcLevelTag';
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
  wasProductPushedHere,
} from '../piPlanLink';
import { usePlanPreference } from '../planTicksPref';
import { AddPlanetDetail, ProductDetail, type FinderOrigin } from './MapDetail';
import { MapBoard } from './MapBoard';
import { MapHelp } from './MapHelp';
import { MapPhone } from './MapPhone';
import { ColonyRichness } from './ColonyRichness';
import { PiDrawer } from './PiDrawer';
import { PlanetImage } from '../PlanetImage';
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
import { buildProductDetail } from './productDetailModel';

const PHONE_QUERY = '(max-width: 47.99rem)';

export interface MapColony {
  planetId: number;
  type: PlanetType;
  name: string;
}

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

export interface PlanMapProps {
  /** The colony read failed: `colonies` is empty because it is unknown, not because there are none. */
  coloniesUnknown?: boolean;
  /** Hub prices could not be read: `advice` is unpriced, so "your planets already make their best" cannot be said. */
  pricesFailed?: boolean;
  graph: MapGraph;
  advice: PlanAdvice;
  /** The same advice with these planet types added as what-ifs: priced for them, never for the picks. */
  adviceWithWhatIf: (types: ReadonlySet<PlanetType>) => PlanAdvice;
  colonies: readonly MapColony[];
  finder: FinderOrigin;
  /** P3/P4 multi-planet chain estimates (`useChainEstimates`); none when left out. */
  chainOf?: ChainEstimateOf;
  /** The PI data, for what-if Bigger chains; none are priced when left out. */
  pi?: PiData | null;
}

const NO_CHAINS: ChainEstimateOf = () => null;

type DetailKind = 'product' | 'planet';

export function PlanMap({
  graph,
  advice,
  adviceWithWhatIf,
  colonies,
  finder,
  coloniesUnknown = false,
  pricesFailed = false,
  chainOf = NO_CHAINS,
  pi = null,
}: PlanMapProps) {
  const { t } = useTranslation();
  const phone = useMediaQuery(PHONE_QUERY);
  const context = useTouchContext();
  const location = useLocation();
  const navigate = useNavigate();

  // The product the URL has open; an id the map does not know is ignored.
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
  /** With no colony, every type is in play: the pilot unticks what they cannot reach. */
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
  const [userTraced, setUserTraced] = useState<Traced | undefined>(
    linked !== null ? { id: linked, explicit: true } : undefined
  );
  const [whatIfTicks, setWhatIfTicks] = useState<ReadonlySet<PlanetType>>(new Set());
  // The ticked what-if types the pilot still lacks, sorted: the order `whatIfKey` and the planet ids use.
  const whatIfTypes = useMemo(
    () => whatIfTypesOf(whatIfKey([...whatIfTicks].filter((type) => !isHave(type)))),
    [whatIfTicks, isHave]
  );
  const whatIf = useMemo<ReadonlySet<PlanetType>>(() => new Set(whatIfTypes), [whatIfTypes]);
  const [preview, setPreview] = useState<PlanetType | null>(null);
  const [detailKind, setDetailKind] = useState<DetailKind>('product');
  // A newly linked product is traced, and stays traced once its drawer closes.
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
  /** The "add a planet" drawer; the product drawer is open while the URL names one. */
  const [planetOpen, setPlanetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(readMapHintDismissed);

  // The colony whose richness drawer the URL has open; an unknown id is dropped.
  const planetRaw = parsePiPlanet(location.search);
  const richnessColony = colonies.find((c) => c.planetId === planetRaw) ?? null;
  const hasPlanetParam = new URLSearchParams(location.search).has(PI_PLANET_PARAM);
  // The URL keeps only what the view uses, in one navigation (two would each
  // start from the same stale search and undo each other): an id the map does
  // not know goes, and with a colony's richness drawer open the product does too.
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

  // --- Detail panel mode, by the layout box's own width -----------------------
  const layoutRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  // No drawer until the width is known: a linked product on a wide screen
  // would otherwise mount a drawer for one frame before the panel docks.
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

  // --- Focus comes back to what opened the drawer ------------------------------
  const returnFocus = useRef<HTMLElement | null>(null);
  const remember = useCallback(() => {
    const active = document.activeElement;
    returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, []);
  // Set until the frame that focuses it: the drawer's own close may run first or second.
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
  const goingBack = useRef(false);
  useEffect(() => {
    goingBack.current = false;
  }, [linked]);
  /** Takes `product` off the URL: Back when this page pushed the entry, else a replace. */
  const dropProduct = useCallback(() => {
    // A second Close before Back lands would go Back twice, maybe off the page.
    if (parsePiProduct(location.search) === null || goingBack.current) return;
    if (wasProductPushedHere(location.state)) {
      goingBack.current = true;
      navigate(-1);
    } else {
      navigate(hrefWithoutPiProduct(location), {
        replace: true,
      });
    }
  }, [location, navigate]);
  // A drawer a link on Plan or Colonies opened has no opener left on this
  // tab: focus goes to that product on the map (a tile, or a phone row), else
  // the page heading, never the page body.
  const lastLinked = useRef<number | null>(null);
  useEffect(() => {
    if (linked !== null) lastLinked.current = linked;
    else if (richnessColony !== null) lastLinked.current = null;
  }, [linked, richnessColony]);
  const productFocusFallback = useCallback((): HTMLElement | null => {
    // An opener this page remembered wins, whether its frame has run yet or not.
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

  // --- Derived view ----------------------------------------------------------
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
  /**
   * Planet types a traced product needs that the pilot has no colony on. The
   * chain is drawn as if they were there (lit, tagged NEED) so the trace runs
   * end to end instead of stopping at a dimmed planet.
   */
  const needTypes = useMemo<ReadonlySet<PlanetType>>(
    () =>
      new Set(
        traced?.explicit && trace && !noColonies
          ? trace.planets.filter((p) => !p.have).map((p) => p.type)
          : []
      ),
    [traced, trace, noColonies]
  );
  // A planet the trace already needs has nothing to preview: hovering it must not pile pink wires on the trace.
  // Hovering a type that is already ticked shows the ticked set, as it is.
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
  // Sizing only: every missing type's preview, and all of them ticked together, are laid out
  // invisibly so the box fits the tallest.
  const sizingUnlocks = useMemo(() => {
    const missing = graph.planetTypes.filter((type) => !isHave(type));
    const sets = missing.map((type) => [type]);
    if (missing.length > 1) sets.push(missing);
    return sets.map((types) => ({
      types,
      unlock: unlockedBy(graph, new Set(types), ticked),
    }));
  }, [graph, isHave, ticked]);
  const haulBetween = usePiSettings((state) => state.value.haulBetweenPlanets === true);
  const chainsOn = haulBetween && pi !== null && !pricesFailed;
  const whatIfChainKey = chainsOn && whatIfTypes.length > 0 ? whatIfKey(whatIfTypes) : null;
  // One new planet per ticked type: every one needs its own free slot.
  const hasFreeSlot = advice.slots.free >= whatIfTypes.length;
  // Fed by `WhatIfChainsFeed`.
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
  // Lit only while the ticked what-if set is the one shown: hovering a type previews that type alone.
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
  const colonySales = useMemo(
    () =>
      advice.colonies.map((c) => ({
        name: c.name ?? t('pi.planetLabel', { id: c.planetId }),
        sells: c.sells,
      })),
    [advice, t]
  );

  const whatIfAdvice = useMemo(
    () => (whatIf.size > 0 ? adviceWithWhatIf(whatIf) : null),
    [whatIf, adviceWithWhatIf]
  );
  const whatIfRecipe = useMemo(
    () => (whatIfAdvice ? unlockedRecipe(whatIfAdvice, whatIf, [...owned]) : null),
    [whatIf, whatIfAdvice, owned]
  );

  /** The detail shows the what-if planet: chosen, or nothing else is traced. */
  const showWhatIf = whatIf.size > 0 && (detailKind === 'planet' || traced === null);

  // --- Actions ---------------------------------------------------------------
  // A product linked while docked stays in the docked panel: narrowing the
  // window must not pop it open as a drawer, so it is dropped from the URL.
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
  // Back (or Close) took the product off the URL: focus goes back to the opener,
  // unless another drawer is taking over.
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
    // Already in a drawer (the add-planet "best recipe" button): keep the
    // original opener as the place focus returns to.
    if (!docked && !drawerShown) remember();
    setUserTraced({ id: typeId, explicit: true });
    setDetailKind('product');
    const href = piProductHref(typeId, location.search);
    if (planetShown) {
      // The planet drawer's own Back entry becomes the product's. No marker:
      // what is under it may not be this page's, so Close replaces, never goes Back.
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
    // Before the NEED branch: a ticked what-if unticks even when the trace needs it.
    if (whatIfTicks.has(type)) {
      const next = new Set(whatIfTicks);
      next.delete(type);
      setWhatIfTicks(next);
      // The last one off closes the panel; with others still ticked it now describes them.
      if (next.size === 0) closePlanet();
      return;
    }
    if (needTypes.has(type)) {
      // The traced product already shows what this planet is for and where to
      // find one. A what-if here would swap the panel and pile pink unlock
      // wires on top of the trace.
      if (!docked && !drawerShown) remember();
      setPlanetOpen(false);
      setDetailKind('product');
      // The product drawer is the URL's: bring it back if it was closed.
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
    // One drawer at a time: the product's entry goes, the planet's own comes.
    if (linked !== null) {
      navigate(hrefWithoutPiProduct(location), {
        replace: true,
      });
    }
    setPlanetOpen(true);
  };
  const dismissHint = () => {
    writeMapHintDismissed();
    setHintDismissed(true);
  };
  const clearTrace = () => {
    setUserTraced(null);
    if (linked !== null) dropProduct();
    else restore();
  };
  /**
   * The default first pick is not the pilot's choice: its first click opens it.
   * While the docked panel shows a colony or the what-if, a click brings the
   * product back instead of clearing it.
   */
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

  // --- Pieces ------------------------------------------------------------------
  const detailBody = (() => {
    if (richnessColony) {
      return (
        <ColonyRichness
          planetId={richnessColony.planetId}
          type={richnessColony.type}
          resources={graph.tiers[0]
            .filter((raw) => raw.hosts.includes(richnessColony.type))
            .map((raw) => ({ typeId: raw.typeId, name: raw.name }))}
          onClose={docked ? dropPlanet : undefined}
        />
      );
    }
    if (showWhatIf && whatIfAdvice) {
      const weakest = [...advice.colonies]
        .filter((c) => c.todayPerDay !== null)
        .sort((a, b) => a.todayPerDay! - b.todayPerDay!)[0];
      return (
        <AddPlanetDetail
          graph={graph}
          types={whatIfTypes}
          unlockedIds={unlockedBy(graph, whatIf, ticked).productIds}
          recipe={whatIfRecipe}
          oneHostCount={
            whatIfAdvice.recipes.recipes.filter(
              (r) =>
                r.hostTypes.some((h) => whatIf.has(h)) && !r.hostTypes.some((h) => owned.has(h))
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
          productHref={productHref}
          onClose={() => {
            setWhatIfTicks(new Set());
            closePlanet();
          }}
          chains={
            chainsOn && pi ? (
              !hasFreeSlot ? (
                <p className="text-xs text-text-dim">
                  {t('piMap.add.chainsNoSlot', {
                    count: whatIfTypes.length,
                    free: advice.slots.free,
                  })}
                </p>
              ) : chainsPending ? (
                <div className="flex items-center gap-2 text-xs text-text-dim">
                  <Spinner size="sm" label={t('piMap.add.chainsPricing')} />
                  {t('piMap.add.chainsPricing')}
                </div>
              ) : whatIfCards.length === 0 ? (
                <p className="text-xs text-text-dim">{t('piMap.add.chainsNone')}</p>
              ) : (
                <WhatIfChainCards
                  types={whatIfTypes}
                  cards={whatIfCards}
                  advice={advice}
                  pi={pi}
                  stacked
                />
              )
            ) : undefined
          }
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
          view={buildProductDetail({
            graph,
            typeId: traced.id,
            trace,
            figure: figureOf(traced.id),
            colonies: colonySales,
            ccLevel: advice.rankingBasis.ccLevel,
          })}
          onClearTrace={clearTrace}
        />
      );
    }
    return <p className="text-xs text-text-dim">{t('piMap.detail.empty', { context })}</p>;
  })();
  const detailTitle = richnessColony
    ? t('piMap.richness.title', { name: richnessColony.name })
    : showWhatIf
      ? t('piMap.add.panelTitleFor', {
          type: listFormat.format(whatIfTypes.map((type) => planetName(t, type))),
          count: whatIfTypes.length,
        })
      : traced && tracedProduct
        ? t('piMap.detail.panelTitle', {
            name: tracedProduct.name,
            context: tracedProduct.tier === 0 ? 'raw' : undefined,
          })
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
        <span className="text-text-dim">
          {t(pricesFailed ? 'piMap.picksNoPrices' : 'piMap.picksNone')}
        </span>
      ) : (
        <>
          {picks.picks.map((pick, i) => (
            <span key={pick.typeId} className="inline-flex items-center gap-1.5">
              <Tooltip content={t('common.iskExact', { amount: formatIsk(pick.perDay, 0) })}>
                <Link
                  to={productHref(pick.typeId)}
                  aria-current={traced?.id === pick.typeId ? 'true' : undefined}
                  onClick={(event) => onPlanLinkClick(() => toggleProduct(pick.typeId))(event)}
                  onKeyDown={clickOnSpace}
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
                    {/* A link cannot hold a focusable IskAmount; the tooltip below and this text carry the exact figure. */}
                    <span className="sr-only">
                      {' '}
                      {t('common.iskExact', { amount: formatIsk(pick.perDay, 0) })}
                    </span>
                  </span>
                </Link>
              </Tooltip>
              {pick.needsCcLevel && <CcLevelTag level={pick.needsCcLevel} />}
            </span>
          ))}
          <span className="text-[11px] text-text-dim">
            {picks.kind === 'rebuild'
              ? t('piMap.picksNoteRebuild', {
                  preference: t(
                    preference === 'haul' ? 'piMap.preferenceHaul' : 'piMap.preferenceIsk'
                  ),
                })
              : t('piMap.picksNoteRecipes')}
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
    // Placeholder and active states share one grid cell, so the box is as tall as the taller of the
    // two and hovering never shifts the page (#2796). The idle one stays laid out but invisible.
    const layer =
      'col-start-1 row-start-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-1.5 min-h-10';
    const active = activeWhatIf.size > 0 && unlock ? [...activeWhatIf].sort() : null;
    // `ghost` sizes the box without a second copy of the text in the DOM: the strings come from CSS.
    const preview = (
      types: readonly PlanetType[],
      un: NonNullable<typeof unlock>,
      bestText: string,
      ghost = false
    ) => {
      const text = (s: string, cls?: string) =>
        ghost ? (
          <span data-text={s} className={cx(cls, 'after:content-[attr(data-text)]')} />
        ) : (
          <span className={cls}>{s}</span>
        );
      return (
        <div
          className={cx(layer, 'text-text', ghost && 'invisible')}
          aria-hidden={ghost || undefined}
        >
          {types.map((type) => (
            <PlanetImage key={type} type={type} size={28} />
          ))}
          {text(
            types.length === 1
              ? t('piMap.whatIfTitle', { aType: withArticle(planetName(t, types[0])) })
              : t('piMap.whatIfTitleMany', {
                  types: listFormat.format(types.map((type) => planetName(t, type))),
                }),
            'text-[11px] font-semibold tracking-widest text-map-whatif uppercase'
          )}
          {text(
            (un.productIds.length === 0
              ? t('piMap.whatIfNothing')
              : t('piMap.whatIfUnlocks', { count: un.productIds.length })) + bestText
          )}
          <span aria-hidden="true" className="flex flex-wrap gap-0.5">
            {un.productIds.slice(0, 12).map((id) => (
              <TypeIcon key={id} typeId={id} size={32} width={22} height={22} />
            ))}
          </span>
        </div>
      );
    };
    const best = whatIfRecipe ? ` ${t('piMap.whatIfBest', { name: whatIfRecipe.name })}` : '';
    return (
      <div
        className="grid border-b border-line text-xs text-text-dim"
        aria-live="polite"
        data-testid="map-whatif"
      >
        <div
          className={cx(layer, active !== null && 'invisible')}
          aria-hidden={active ? true : undefined}
        >
          <span className="text-[11px] font-semibold tracking-widest uppercase">
            {t('piMap.whatIfBlank')}
          </span>
          <span>
            {noColonies
              ? t(coloniesUnknown ? 'piMap.whatIfUnknownColonies' : 'piMap.whatIfNoColonies')
              : missingTypes.length > 0
                ? t('piMap.whatIfHint', {
                    types: missingTypes.map((type) => planetName(t, type)).join(', '),
                    context,
                  })
                : t('piMap.whatIfAll')}
          </span>
        </div>
        {active && unlock ? preview(active, unlock, previewed === null ? best : '') : null}
        {sizingUnlocks.map((g) => (
          <Fragment key={g.types.join('+')}>{preview(g.types, g.unlock, best, true)}</Fragment>
        ))}
      </div>
    );
  })();

  const board = (
    <MapBoard
      graph={graph}
      owned={owned}
      noColonies={noColonies}
      ticked={ticked}
      needTypes={needTypes}
      litIds={litIds}
      newIds={newIds}
      whatIfTypes={boardWhatIf}
      whatIfTicked={whatIf}
      trace={trace}
      dimOthers={traced?.explicit ?? false}
      pickRanks={pickRanks}
      pickPlanets={pickPlanets}
      colonyNames={colonyNames}
      figureOf={figureOf}
      onPlanet={clickPlanet}
      onPreview={setPreview}
      onProduct={toggleProduct}
      productHref={productHref}
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
              ticked={litTicked}
              whatIfTypes={whatIf}
              litIds={litIds}
              newIds={newIds}
              tracedId={traced?.id ?? null}
              pickRanks={pickRanks}
              figureOf={figureOf}
              onPlanet={clickPlanet}
              onProduct={toggleProduct}
              productHref={productHref}
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
      {whatIfChainKey && hasFreeSlot && pi && (
        <WhatIfChainsFeed advice={advice} pi={pi} types={whatIfTypes} onChange={setFed} />
      )}

      {/* One drawer for both, so swapping planet for product never closes it
          (a close hands focus back to the opener). The URL backs the product's. */}
      <PiDrawer
        open={drawerShown}
        onClose={richnessShown ? dropPlanet : productShown ? dropProduct : closePlanet}
        title={detailTitle}
        phone={phone}
        closeOnBack={!productShown && !richnessShown}
        returnFocusFallback={productFocusFallback}
      >
        {detailBody}
      </PiDrawer>
      <PiDrawer open={helpOpen} onClose={closeHelp} title={t('piMap.help.title')} phone={phone}>
        <MapHelp />
      </PiDrawer>
    </>
  );
}
