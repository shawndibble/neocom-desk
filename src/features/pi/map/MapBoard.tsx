/**
 * The map itself: planets, then P0 to P4, each a column of real buttons
 * (planets) and links (products) in list markup, with SVG wires drawn behind
 * them.
 *
 * - **Non-visual equivalent.** Every tier is a labelled `<section>` with a
 *   heading and a `<ul>`; each product is a link to its PI detail (`?product=`,
 *   DESIGN.md §6c "Entities", Overrides) whose accessible name is the
 *   whole comparison sentence and price. The wires are `aria-hidden`: the chain
 *   they show is also written out in the detail panel.
 * - **Keyboard.** One tab stop for the whole board (roving `tabIndex`). Up and
 *   Down walk a column, Left and Right hop to the neighbouring column at about
 *   the same height, Home and End jump to a column's ends. Enter or Space on
 *   a product clicks it (PlanMap traces or clears); on a planet, toggles it
 *   or opens "add a planet".
 * - **Ghost slots.** What the ticked planets cannot make keeps its place as an
 *   empty, `aria-hidden` slot so the layout never jumps, and it is not a tab
 *   stop.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { InfoTooltip, Tooltip, TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  focusRingClassName,
  focusRingInsetClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { cx } from '@/lib/cx';
import { onPlanLinkClick } from '@/features/industry/planLinkClick';
import { clickOnSpace } from '@/lib/clickOnSpace';
import { formatIskCompact } from '@/lib/isk';
import { useTouchContext } from '@/lib/useMediaQuery';
import { PlanetImage } from '../PlanetImage';
import { ChainTileFigure } from './ChainTileFigure';
import {
  comparisonSentence,
  figureSentence,
  planetName,
  productAccessibleName,
  tierName,
  verdictGlyph,
  VERDICT_TONE,
} from './mapText';
import {
  tileChainIsk,
  traceProduct,
  type MapGraph,
  type MapTier,
  type ProductFigure,
  type Trace,
} from './mapModel';

const TIERS: readonly MapTier[] = [0, 1, 2, 3, 4];

export interface MapBoardProps {
  graph: MapGraph;
  owned: ReadonlySet<PlanetType>;
  /** No colony yet: every type is in play and each is a plain toggle. */
  noColonies: boolean;
  /** Planet types the map is filtered to: what it can make is lit, the rest leaves ghost slots. */
  ticked: ReadonlySet<PlanetType>;
  /** Missing planet types the traced product needs: drawn lit, tagged NEED, though not ticked. */
  needTypes: ReadonlySet<PlanetType>;
  /** Products the ticked planet types can make. */
  litIds: ReadonlySet<number>;
  /** Products a what-if planet (hovered, focused or open in the detail panel) would unlock. */
  newIds: ReadonlySet<number>;
  /** The what-if planet types shown (the ticked set, or the one hovered); none the pilot has. */
  whatIfTypes: ReadonlySet<PlanetType>;
  /** The what-if types ticked, which the planet toggles read as pressed (a hovered one is not). */
  whatIfTicked: ReadonlySet<PlanetType>;
  trace: Trace | null;
  /** Fade everything off the trace: only once the pilot traced something themselves. */
  dimOthers: boolean;
  /** Product -> its pick rank (1 to 3). */
  pickRanks: ReadonlyMap<number, number>;
  /** Planet type -> the pick ranks that use it. */
  pickPlanets: ReadonlyMap<PlanetType, number[]>;
  /** Planet type -> names of the pilot's colonies on it. */
  colonyNames: ReadonlyMap<PlanetType, string[]>;
  figureOf: (typeId: number) => ProductFigure;
  onPlanet: (type: PlanetType) => void;
  onPreview: (type: PlanetType | null) => void;
  onProduct: (typeId: number) => void;
  /** The product's PI detail URL: a tile is a real link, so new tab and copy link work. */
  productHref: (typeId: number) => string;
}

type Key = string;
const planetKey = (type: PlanetType): Key => `planet:${type}`;
const productKey = (typeId: number): Key => `p:${typeId}`;

interface Wire {
  d: string;
  cls: string;
  /** Where the wire meets its two nodes: dotted while the pointer or focus is on one of them. */
  ends?: readonly [{ x: number; y: number }, { x: number; y: number }];
}

export function MapBoard(props: MapBoardProps) {
  const touchCtx = useTouchContext();
  const { graph, owned, ticked, litIds, newIds, trace, dimOthers } = props;
  const { t } = useTranslation();
  const headingId = useId();
  const boardRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<Key, HTMLElement>());
  const [focusKey, setFocusKey] = useState<Key | null>(null);
  /** The node under the pointer or focus: its own wires stand out, the rest step back. */
  const [aim, setAim] = useState<Key | null>(null);
  const aimEvents = (key: Key) => ({
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') setAim(key);
    },
    onPointerLeave: () => setAim((current) => (current === key ? null : current)),
    onFocus: () => setAim(key),
    onBlur: () => setAim((current) => (current === key ? null : current)),
  });
  const [wires, setWires] = useState<Wire[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [layoutVersion, setLayoutVersion] = useState(0);

  // Hovering a product lights its whole chain back to the planets, as a click would trace it.
  const hover = useMemo(() => {
    const id = aim?.startsWith('p:') ? Number(aim.slice(2)) : null;
    if (id === null || !graph.byId.has(id)) return null;
    const chain = traceProduct(graph, id, { owned, ticked });
    return {
      edges: new Set(chain.edges.map(([from, to]) => `${from}>${to}`)),
      planetEdges: new Set(chain.planetEdges.map(([type, raw]) => `${type}>${raw}`)),
    };
  }, [aim, graph, owned, ticked]);

  const visible = useCallback(
    (typeId: number) => litIds.has(typeId) || newIds.has(typeId),
    [litIds, newIds]
  );

  // The columns in tab order, each a list of focusable keys.
  const columns = useMemo<Key[][]>(
    () => [
      graph.planetTypes.map(planetKey),
      ...TIERS.map((tier) =>
        graph.tiers[tier].filter((p) => visible(p.typeId)).map((p) => productKey(p.typeId))
      ),
    ],
    [graph, visible]
  );
  const activeKey = useMemo<Key | null>(() => {
    const all = columns.flat();
    if (focusKey && all.includes(focusKey)) return focusKey;
    return all[0] ?? null;
  }, [columns, focusKey]);

  const register = useCallback(
    (key: Key) => (el: HTMLElement | null) => {
      if (el) nodes.current.set(key, el);
      else nodes.current.delete(key);
    },
    []
  );

  // --- Wires ---------------------------------------------------------------
  useEffect(() => {
    const board = boardRef.current;
    if (!board || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setLayoutVersion((v) => v + 1));
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const origin = board.getBoundingClientRect();
    const spot = (key: Key) => {
      const el = nodes.current.get(key);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        l: r.left - origin.left,
        r: r.right - origin.left,
        y: r.top - origin.top + r.height / 2,
      };
    };
    const curve = (a: { r: number; y: number }, b: { l: number; y: number }) => {
      const x1 = a.r;
      const x2 = b.l - 1;
      const dx = (x2 - x1) * 0.5;
      return `M${x1},${a.y} C${x1 + dx},${a.y} ${x2 - dx},${b.y} ${x2},${b.y}`;
    };
    const ends = (a: { r: number; y: number }, b: { l: number; y: number }) =>
      [
        { x: a.r, y: a.y },
        { x: b.l - 1, y: b.y },
      ] as const;
    const traceEdges = new Set((trace?.edges ?? []).map(([from, to]) => `${from}>${to}`));
    const tracePlanetEdges = new Set(
      (trace?.planetEdges ?? []).map(([type, raw]) => `${type}>${raw}`)
    );
    const base: Wire[] = [];
    const mid: Wire[] = [];
    const top: Wire[] = [];
    const quiet = trace !== null && dimOthers;

    for (const product of graph.byId.values()) {
      for (const input of product.inputs) {
        const a = spot(productKey(input));
        const b = spot(productKey(product.typeId));
        if (!a || !b) continue;
        const key = `${input}>${product.typeId}`;
        const mine =
          aim !== null &&
          (aim === productKey(input) ||
            aim === productKey(product.typeId) ||
            ((hover?.edges.has(key) ?? false) && visible(input) && visible(product.typeId)));
        // A wire that jumps a column crosses tiles: dashed, so it reads as a skip.
        const skips =
          (graph.byId.get(input)?.tier ?? 0) + 1 < product.tier ? '[stroke-dasharray:6_4]' : '';
        if (mine) {
          top.push({
            d: curve(a, b),
            cls: cx('stroke-accent stroke-[3]', skips),
            ends: ends(a, b),
          });
        } else if (traceEdges.has(key)) {
          top.push({
            d: curve(a, b),
            cls: cx(aim ? 'stroke-accent/25 stroke-1' : 'stroke-accent stroke-2', skips),
          });
        } else if (newIds.has(product.typeId) && visible(input)) {
          mid.push({ d: curve(a, b), cls: 'stroke-map-whatif/50 stroke-[1.2]' });
        } else if (litIds.has(product.typeId) && litIds.has(input)) {
          base.push({
            d: curve(a, b),
            // Off-path wires step back whenever a chain is lit, so the lit one is what the eye follows.
            cls: cx(
              aim || quiet
                ? 'stroke-line/20'
                : trace !== null
                  ? 'stroke-line-bright/25'
                  : 'stroke-line-bright/45',
              skips
            ),
          });
        }
      }
    }
    for (const raw of graph.tiers[0]) {
      const b = spot(productKey(raw.typeId));
      if (!b) continue;
      for (const type of raw.hosts) {
        const a = spot(planetKey(type));
        if (!a) continue;
        const key = `${type}>${raw.typeId}`;
        const chained = (hover?.planetEdges.has(key) ?? false) && visible(raw.typeId);
        const mine =
          aim !== null && (aim === planetKey(type) || aim === productKey(raw.typeId) || chained);
        if (mine && (ticked.has(type) || tracePlanetEdges.has(key) || chained)) {
          top.push({ d: curve(a, b), cls: 'stroke-warning stroke-[3]', ends: ends(a, b) });
        } else if (tracePlanetEdges.has(key)) {
          top.push({
            d: curve(a, b),
            cls: aim ? 'stroke-warning/25 stroke-1' : 'stroke-warning stroke-2',
          });
        } else if (newIds.has(raw.typeId) && props.whatIfTypes.has(type)) {
          mid.push({ d: curve(a, b), cls: 'stroke-map-whatif/50 stroke-[1.2]' });
        } else if (ticked.has(type) && litIds.has(raw.typeId) && !quiet) {
          base.push({
            d: curve(a, b),
            cls: trace !== null ? 'stroke-line-bright/20' : 'stroke-line-bright/30',
          });
        }
      }
    }
    setWires([...base, ...mid, ...top]);
    setSize({ w: origin.width, h: origin.height });
  }, [
    graph,
    litIds,
    newIds,
    ticked,
    trace,
    dimOthers,
    aim,
    props.whatIfTypes,
    visible,
    hover,
    layoutVersion,
  ]);

  // --- Roving focus --------------------------------------------------------
  function move(key: Key, event: KeyboardEvent<HTMLElement>) {
    const col = columns.findIndex((c) => c.includes(key));
    if (col < 0) return;
    const list = columns[col];
    const at = list.indexOf(key);
    let next: Key | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = list[Math.min(at + 1, list.length - 1)];
        break;
      case 'ArrowUp':
        next = list[Math.max(at - 1, 0)];
        break;
      case 'Home':
        next = list[0];
        break;
      case 'End':
        next = list[list.length - 1];
        break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        const target = columns[col + (event.key === 'ArrowRight' ? 1 : -1)];
        if (!target || target.length === 0) break;
        const here = nodes.current.get(key)?.getBoundingClientRect();
        const y = here ? here.top + here.height / 2 : 0;
        let best = target[Math.min(at, target.length - 1)];
        if (here && here.height > 0) {
          let bestDistance = Infinity;
          for (const candidate of target) {
            const r = nodes.current.get(candidate)?.getBoundingClientRect();
            if (!r) continue;
            const distance = Math.abs(r.top + r.height / 2 - y);
            if (distance < bestDistance) {
              best = candidate;
              bestDistance = distance;
            }
          }
        }
        next = best;
        break;
      }
      default:
        return;
    }
    event.preventDefault();
    if (next) {
      setFocusKey(next);
      nodes.current.get(next)?.focus();
    }
  }

  const inTrace = (typeId: number) => trace?.ids.has(typeId) ?? false;

  return (
    <div
      className="relative overflow-x-auto overflow-y-hidden overscroll-x-contain"
      data-testid="pi-map-scroll"
    >
      <div
        ref={boardRef}
        role="group"
        onBlur={(event) => {
          // The what-if preview lives while focus moves within the board (a
          // planet to a tile it unlocked); it ends only when focus leaves.
          if (!event.currentTarget.contains(event.relatedTarget)) props.onPreview(null);
        }}
        aria-labelledby={headingId}
        className="relative mx-auto grid w-max grid-cols-[6rem_8.25rem_9.125rem_12.25rem_11.5rem_12.125rem] gap-x-4 py-3 pr-3"
      >
        <h3 id={headingId} className="sr-only">
          {t('piMap.boardLabel')}
        </h3>
        <svg
          aria-hidden="true"
          focusable="false"
          width={size.w}
          height={size.h}
          className="pointer-events-none absolute inset-0 overflow-visible fill-none"
        >
          {wires.map((wire, i) => (
            <path key={i} d={wire.d} className={wire.cls} />
          ))}
          {wires.flatMap((wire, i) =>
            (wire.ends ?? []).map((end, j) => (
              <circle
                key={`${i}-${j}`}
                cx={end.x}
                cy={end.y}
                r={3.5}
                className={cx(
                  'stroke-bg stroke-1',
                  wire.cls.includes('warning') ? 'fill-warning' : 'fill-accent'
                )}
              />
            ))
          )}
        </svg>

        {/* Planets */}
        <section
          aria-labelledby={`${headingId}-planets`}
          className="sticky left-0 z-10 box-content flex flex-col bg-panel pl-3 shadow-[1px_0_0_var(--color-line)]"
        >
          <ColumnHead
            id={`${headingId}-planets`}
            title={t('piMap.planetsTitle')}
            sub={t('piMap.planetsSub')}
            info={t('piMap.planetsInfo', { context: touchCtx })}
            infoLabel={t('piMap.infoLabel', { name: t('piMap.planetsTitle') })}
          />
          <ul className="flex flex-1 flex-col justify-between">
            {graph.planetTypes.map((type) => (
              <li key={type} className="flex justify-center" {...aimEvents(planetKey(type))}>
                <PlanetToggle
                  type={type}
                  have={owned.has(type)}
                  togglable={props.noColonies || owned.has(type)}
                  pressed={
                    props.noColonies || owned.has(type)
                      ? ticked.has(type)
                      : props.whatIfTicked.has(type)
                  }
                  names={props.colonyNames.get(type) ?? []}
                  ranks={props.pickPlanets.get(type) ?? []}
                  tracedNeed={trace?.planets.find((p) => p.type === type) ?? null}
                  registerNode={register(planetKey(type))}
                  tabbable={activeKey === planetKey(type)}
                  onFocusKey={() => setFocusKey(planetKey(type))}
                  boardRef={boardRef}
                  onKeyDown={(e) => move(planetKey(type), e)}
                  onClick={() => props.onPlanet(type)}
                  onPreview={props.onPreview}
                  needed={props.needTypes.has(type)}
                  whatIf={props.whatIfTypes.has(type) && !owned.has(type) && !props.noColonies}
                />
              </li>
            ))}
          </ul>
        </section>

        {TIERS.map((tier) => (
          <section
            key={tier}
            aria-labelledby={`${headingId}-${tier}`}
            className="relative flex flex-col"
            data-tier={tier}
          >
            <ColumnHead
              id={`${headingId}-${tier}`}
              title={tierName(t, tier)}
              sub={t(`piMap.tier.${tier}.sub`)}
              info={t(`piMap.tier.${tier}.info`)}
              infoLabel={t('piMap.infoLabel', { name: tierName(t, tier) })}
              count={t('piMap.tierCount', {
                shown: graph.tiers[tier].filter((p) => visible(p.typeId)).length,
                total: graph.tiers[tier].length,
              })}
            />
            <ul className="flex flex-1 flex-col justify-center gap-[0.1875rem]">
              {graph.tiers[tier].map((product) => {
                if (!visible(product.typeId)) {
                  return (
                    <li
                      key={product.typeId}
                      aria-hidden="true"
                      className="h-9 flex-none md:h-[2.125rem] touch:h-9"
                    />
                  );
                }
                const key = productKey(product.typeId);
                const figure = props.figureOf(product.typeId);
                const isNew = newIds.has(product.typeId);
                const rank = props.pickRanks.get(product.typeId) ?? null;
                const goal = trace?.product === product.typeId;
                const onPath = inTrace(product.typeId);
                const glyph = verdictGlyph(figure);
                const tip = [
                  product.tier === 0
                    ? t('piMap.rawYields', {
                        types: product.hosts.map((type) => planetName(t, type)).join(', '),
                      })
                    : comparisonSentence(t, figure),
                  figureSentence(t, figure),
                  figure.kind !== 'unranked'
                    ? null
                    : figure.whatIf
                      ? t('piMap.add.chainsTip')
                      : figure.chain
                        ? t('piMap.chainTip', { context: touchCtx })
                        : null,
                ]
                  .filter(Boolean)
                  .map((line) => `• ${line}`)
                  .join('\n');
                const unlockedBy = isNew
                  ? [...props.whatIfTypes].filter(
                      (type) => product.tier > 0 || product.hosts.includes(type)
                    )
                  : [];
                const chainIsk = tileChainIsk(figure);
                return (
                  <li key={product.typeId} className="relative flex-none" {...aimEvents(key)}>
                    <Tooltip content={tip}>
                      <Link
                        to={props.productHref(product.typeId)}
                        ref={register(key)}
                        data-map-key={key}
                        tabIndex={activeKey === key ? 0 : -1}
                        aria-current={goal ? 'true' : undefined}
                        aria-label={productAccessibleName(t, product, figure, {
                          rank,
                          unlockedBy,
                          traced: goal,
                        })}
                        onFocus={() => setFocusKey(key)}
                        onKeyDown={(e) => clickOnSpace(e) || move(key, e)}
                        onClick={onPlanLinkClick(() => props.onProduct(product.typeId))}
                        className={cx(
                          'grid min-h-9 w-full md:min-h-[2.125rem] touch:min-h-9 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-1.5 rounded-xs border py-0.5 pr-[0.3125rem] pl-[0.1875rem] text-left text-xs',
                          interactiveClassName,
                          focusRingClassName,
                          goal
                            ? 'border-line border-l-2 border-l-accent bg-panel-2'
                            : isNew
                              ? 'border-map-whatif bg-map-whatif/12'
                              : onPath
                                ? 'border-accent-dim bg-accent/12'
                                : 'border-line bg-panel-2 [@media(hover:hover)]:hover:border-line-bright',
                          dimOthers && trace !== null && !onPath && !isNew && 'opacity-40'
                        )}
                      >
                        <TypeIcon typeId={product.typeId} size={64} width={24} height={24} />
                        <span
                          className={cx(
                            'min-w-0 text-xs leading-[0.8125rem] whitespace-normal',
                            goal || onPath ? 'font-semibold text-text' : 'text-text',
                            goal && 'text-accent'
                          )}
                        >
                          {product.name}
                        </span>
                        {glyph && figure.kind === 'ranked' ? (
                          <span
                            aria-hidden="true"
                            className="flex items-center gap-1 text-[0.6875rem] tabular-nums"
                          >
                            <span
                              className={cx(
                                'text-[0.6875rem] leading-[0.6875rem] font-bold',
                                VERDICT_TONE[glyph]
                              )}
                            >
                              {glyph}
                            </span>
                            <span className="font-semibold">
                              {formatIskCompact(figure.iskPerDay)}
                            </span>
                            {figure.needsCcLevel && (
                              <span className="rounded-xs border border-warning/60 px-1 text-[0.625rem] leading-[0.875rem] font-semibold text-warning">
                                {t('piMap.needsCcShort', { level: figure.needsCcLevel })}
                              </span>
                            )}
                          </span>
                        ) : chainIsk !== null ? (
                          <ChainTileFigure iskPerDay={chainIsk} stacked />
                        ) : (
                          <span aria-hidden="true" />
                        )}
                      </Link>
                    </Tooltip>
                    {rank !== null && (
                      <span
                        aria-hidden="true"
                        className={cx(
                          'pointer-events-none absolute top-1/2 -left-[0.9375rem] z-[1] grid h-[1.125rem] min-w-[1.375rem] -translate-y-1/2 place-items-center rounded-xs border border-warning px-[0.1875rem] text-[0.6875rem] font-bold',
                          goal ? 'bg-warning text-bg' : 'bg-bg text-warning'
                        )}
                      >
                        #{rank}
                      </span>
                    )}
                    {isNew && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-0 right-0 z-[1] grid size-[0.875rem] -translate-y-1/3 translate-x-1/3 place-items-center rounded-xs bg-map-whatif p-px text-bg"
                      >
                        <Icon.Increase size="100%" aria-hidden="true" />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {/* Gaps carry no fill (a grey box read as a broken tile); a column left with none says why. */}
            {graph.tiers[tier].every((product) => !visible(product.typeId)) && (
              <p className="pointer-events-none absolute inset-x-0 top-1/2 px-2 text-center text-[0.6875rem] text-text-dim">
                {t('piMap.columnNone')}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function ColumnHead(props: {
  id: string;
  title: string;
  sub: string;
  info: string;
  infoLabel: string;
  count?: string;
}) {
  return (
    <div className="h-[3.25rem]">
      <div className="flex items-center gap-1.5">
        <h4
          id={props.id}
          className="text-[0.6875rem] font-semibold tracking-widest text-text uppercase"
        >
          {props.title}
        </h4>
        <InfoTooltip label={props.infoLabel} content={props.info} />
      </div>
      <p className="mt-[0.1875rem] text-[0.6875rem] leading-[1.25] text-text-dim">{props.sub}</p>
      {props.count && <span className="sr-only">{props.count}</span>}
    </div>
  );
}

function PlanetToggle({
  registerNode,
  ...props
}: {
  type: PlanetType;
  have: boolean;
  /** A plain show/hide toggle: the pilot has this type, or has no colony at all. */
  togglable: boolean;
  pressed: boolean;
  names: string[];
  ranks: number[];
  tracedNeed: { have: boolean } | null;
  whatIf: boolean;
  needed: boolean;
  tabbable: boolean;
  registerNode: (el: HTMLElement | null) => void;
  boardRef: RefObject<HTMLElement | null>;
  onFocusKey: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onClick: () => void;
  onPreview: (type: PlanetType | null) => void;
}) {
  const { t } = useTranslation();
  const touchCtx = useTouchContext();
  const { type, have, togglable, pressed } = props;
  const name = planetName(t, type);
  const label = have
    ? t('piMap.planetHave', { name, count: props.names.length, names: props.names.join(', ') })
    : togglable
      ? t('piMap.planetToggle', { name })
      : t('piMap.planetMissing', { name });
  const tip = togglable
    ? t(pressed ? 'piMap.planetTipOn' : 'piMap.planetTipOff', { name, context: touchCtx })
    : t('piMap.planetTipMissing', { name, context: touchCtx });
  const previewable = !togglable;
  return (
    <Tooltip content={tip}>
      <button
        type="button"
        ref={registerNode}
        data-map-key={planetKey(type)}
        tabIndex={props.tabbable ? 0 : -1}
        aria-pressed={pressed}
        aria-label={label}
        onFocus={() => {
          props.onFocusKey();
          // Landing on a planet the pilot has ends any other planet's preview.
          props.onPreview(previewable ? type : null);
        }}
        onPointerEnter={(event) => {
          // Touch fires enter on tap with no leave, which would stick the preview.
          if (event.pointerType === 'mouse' && previewable) props.onPreview(type);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'mouse' || !previewable) return;
          // A focused tile this preview unlocked must not vanish under the pointer.
          const active = document.activeElement;
          if (active instanceof HTMLElement && active.dataset.mapKey?.startsWith('p:')) {
            if (props.boardRef.current?.contains(active)) return;
          }
          props.onPreview(null);
        }}
        onKeyDown={props.onKeyDown}
        onClick={props.onClick}
        className={cx(
          'relative flex w-[4.5rem] flex-col items-center gap-[0.1875rem] rounded-xs border border-transparent px-0 py-[0.1875rem] text-text',
          interactiveClassName,
          focusRingInsetClassName,
          '[@media(hover:hover)]:hover:border-line-bright [@media(hover:hover)]:hover:bg-panel-2',
          pressed && have && 'bg-accent/10'
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            'absolute top-0.5 right-1.5 z-[1] grid size-3.5 place-items-center rounded-xs border text-[0.6875rem] leading-none',
            pressed
              ? 'border-accent bg-accent text-accent-contrast'
              : 'border-line-bright bg-panel-2'
          )}
        >
          {pressed && <Icon.Done size="100%" aria-hidden="true" />}
        </span>
        <PlanetImage
          type={type}
          size={40}
          className={cx(
            'outline-2 outline-offset-1',
            !pressed && !props.needed && 'brightness-[.45] grayscale',
            props.ranks.length > 0 && have ? 'outline-warning' : 'outline-transparent',
            props.whatIf && 'outline-map-whatif brightness-100 grayscale-0'
          )}
        />
        <span
          className={cx(
            'text-[0.6875rem] leading-[0.8125rem] font-semibold',
            !pressed && 'text-text-dim'
          )}
        >
          {name}
        </span>
        <span aria-hidden="true" className="flex min-h-[0.875rem] flex-wrap justify-center gap-0.5">
          {have && (
            <span className="inline-flex h-3.5 items-center rounded-xs border border-success/50 px-[0.1875rem] text-[0.6875rem] font-semibold tracking-wider text-success uppercase">
              {t('piMap.tagHave')}
            </span>
          )}
          {props.ranks.map((rank) => (
            <span
              key={rank}
              className="inline-flex h-3.5 items-center rounded-xs border border-warning/60 px-[0.1875rem] text-[0.6875rem] font-semibold text-warning"
            >
              #{rank}
            </span>
          ))}
          {props.tracedNeed && !props.tracedNeed.have && (
            <span className="inline-flex h-3.5 items-center rounded-xs border border-danger/50 px-[0.1875rem] text-[0.6875rem] font-semibold tracking-wider text-danger uppercase">
              {t('piMap.tagNeed')}
            </span>
          )}
          {props.whatIf && (
            <span className="inline-flex h-3.5 items-center rounded-xs border border-map-whatif/60 px-[0.1875rem] text-[0.6875rem] font-semibold tracking-wider text-map-whatif uppercase">
              {t('piMap.tagWhatIf')}
            </span>
          )}
        </span>
      </button>
    </Tooltip>
  );
}
