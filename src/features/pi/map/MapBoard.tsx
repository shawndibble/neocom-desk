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
 *   the same height, Home and End jump to a column's ends. Enter on a product
 *   traces it and opens its detail; Enter or Space on a planet toggles it or
 *   opens "add a planet".
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
import { formatIskCompact } from '@/lib/isk';
import { useTouchContext } from '@/lib/useMediaQuery';
import { PlanetImage } from './PlanetImage';
import {
  comparisonSentence,
  figureSentence,
  planetName,
  productAccessibleName,
  tierName,
  verdictGlyph,
} from './mapText';
import type { MapGraph, MapTier, ProductFigure, Trace } from './mapModel';

const TIERS: readonly MapTier[] = [0, 1, 2, 3, 4];

export interface MapBoardProps {
  graph: MapGraph;
  owned: ReadonlySet<PlanetType>;
  /** No colony yet: every type is in play and each is a plain toggle. */
  noColonies: boolean;
  /** Planet types the map is filtered to: what it can make is lit, the rest leaves ghost slots. */
  ticked: ReadonlySet<PlanetType>;
  /** Products the ticked planet types can make. */
  litIds: ReadonlySet<number>;
  /** Products a what-if planet (hovered, focused or open in the detail panel) would unlock. */
  newIds: ReadonlySet<number>;
  /** The planet type being tried, for the pink marker under it. */
  whatIfType: PlanetType | null;
  /** True while the what-if is the open detail panel (the planet toggle reads as pressed). */
  whatIfOpen: boolean;
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
}

export function MapBoard(props: MapBoardProps) {
  const touchCtx = useTouchContext();
  const { graph, owned, ticked, litIds, newIds, trace, dimOthers } = props;
  const { t } = useTranslation();
  const headingId = useId();
  const boardRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<Key, HTMLElement>());
  const [focusKey, setFocusKey] = useState<Key | null>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [layoutVersion, setLayoutVersion] = useState(0);

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
        if (traceEdges.has(key)) {
          top.push({ d: curve(a, b), cls: 'stroke-accent stroke-2' });
        } else if (newIds.has(product.typeId) && visible(input)) {
          mid.push({ d: curve(a, b), cls: 'stroke-map-whatif/50 stroke-[1.2]' });
        } else if (litIds.has(product.typeId) && litIds.has(input)) {
          base.push({ d: curve(a, b), cls: quiet ? 'stroke-line/20' : 'stroke-line-bright/45' });
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
        if (tracePlanetEdges.has(key)) {
          top.push({ d: curve(a, b), cls: 'stroke-warning stroke-2' });
        } else if (newIds.has(raw.typeId) && props.whatIfType === type) {
          mid.push({ d: curve(a, b), cls: 'stroke-map-whatif/50 stroke-[1.2]' });
        } else if (ticked.has(type) && litIds.has(raw.typeId) && !quiet) {
          base.push({ d: curve(a, b), cls: 'stroke-line-bright/30' });
        }
      }
    }
    setWires([...base, ...mid, ...top]);
    setSize({ w: origin.width, h: origin.height });
  }, [graph, litIds, newIds, ticked, trace, dimOthers, props.whatIfType, visible, layoutVersion]);

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
        className="relative mx-auto grid w-max grid-cols-[96px_116px_146px_196px_184px_194px] gap-x-4 py-3 pr-3"
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
              <li key={type} className="flex justify-center">
                <PlanetToggle
                  type={type}
                  have={owned.has(type)}
                  togglable={props.noColonies || owned.has(type)}
                  pressed={
                    props.noColonies || owned.has(type)
                      ? ticked.has(type)
                      : props.whatIfOpen && props.whatIfType === type
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
                  whatIf={props.whatIfType === type && !owned.has(type) && !props.noColonies}
                />
              </li>
            ))}
          </ul>
        </section>

        {TIERS.map((tier) => (
          <section
            key={tier}
            aria-labelledby={`${headingId}-${tier}`}
            className="flex flex-col"
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
            <ul className="flex flex-1 flex-col justify-center gap-[3px]">
              {graph.tiers[tier].map((product) => {
                if (!visible(product.typeId)) {
                  return (
                    <li
                      key={product.typeId}
                      aria-hidden="true"
                      className="h-11 flex-none rounded-xs bg-panel-2/35 md:h-[34px] touch:h-11"
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
                ]
                  .filter(Boolean)
                  .join('\n');
                const unlockedBy = isNew ? props.whatIfType : null;
                return (
                  <li key={product.typeId} className="relative flex-none">
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
                        onKeyDown={(e) => move(key, e)}
                        onClick={onPlanLinkClick(() => props.onProduct(product.typeId))}
                        className={cx(
                          'grid h-11 w-full md:h-[34px] touch:h-11 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-1.5 rounded-xs border py-0 pr-[5px] pl-[3px] text-left text-xs',
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
                            'min-w-0 text-xs leading-[13px] whitespace-normal',
                            goal || onPath ? 'font-semibold text-text' : 'text-text',
                            goal && 'text-accent'
                          )}
                        >
                          {product.name}
                        </span>
                        {glyph && figure.kind === 'ranked' ? (
                          <span
                            aria-hidden="true"
                            className="flex items-center gap-1 text-[11px] tabular-nums"
                          >
                            <span
                              className={cx(
                                'text-[11px] leading-[11px] font-bold',
                                glyph === '▲' && 'text-success',
                                glyph === '▼' && 'text-danger',
                                glyph === '≈' && 'text-text-dim'
                              )}
                            >
                              {glyph}
                            </span>
                            <span className="font-semibold">
                              {formatIskCompact(figure.iskPerDay)}
                            </span>
                          </span>
                        ) : (
                          <span aria-hidden="true" />
                        )}
                      </Link>
                    </Tooltip>
                    {rank !== null && (
                      <span
                        aria-hidden="true"
                        className={cx(
                          'pointer-events-none absolute top-1/2 -left-[15px] z-[1] grid h-[18px] min-w-[22px] -translate-y-1/2 place-items-center rounded-xs border border-warning px-[3px] text-[11px] font-bold',
                          goal ? 'bg-warning text-bg' : 'bg-bg text-warning'
                        )}
                      >
                        #{rank}
                      </span>
                    )}
                    {isNew && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-0 right-0 z-[1] grid size-[14px] -translate-y-1/3 translate-x-1/3 place-items-center rounded-xs bg-map-whatif p-px text-bg"
                      >
                        <Icon.Increase size="100%" aria-hidden="true" />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
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
    <div className="h-[52px]">
      <div className="flex items-center gap-1.5">
        <h4 id={props.id} className="text-[11px] font-semibold tracking-widest text-text uppercase">
          {props.title}
        </h4>
        <InfoTooltip label={props.infoLabel} content={props.info} />
      </div>
      <p className="mt-[3px] text-[11px] leading-[1.25] text-text-dim">{props.sub}</p>
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
          'relative flex w-[72px] flex-col items-center gap-[3px] rounded-xs border border-transparent px-0 py-[3px] text-text',
          interactiveClassName,
          focusRingInsetClassName,
          '[@media(hover:hover)]:hover:border-line-bright [@media(hover:hover)]:hover:bg-panel-2',
          pressed && have && 'bg-accent/10'
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            'absolute top-0.5 right-1.5 z-[1] grid size-3.5 place-items-center rounded-xs border text-[11px] leading-none',
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
            !pressed && 'brightness-[.45] grayscale',
            props.ranks.length > 0 && have ? 'outline-warning' : 'outline-transparent',
            props.whatIf && 'outline-map-whatif brightness-100 grayscale-0'
          )}
        />
        <span
          className={cx('text-[11px] leading-[13px] font-semibold', !pressed && 'text-text-dim')}
        >
          {name}
        </span>
        <span aria-hidden="true" className="flex min-h-[14px] flex-wrap justify-center gap-0.5">
          {have && (
            <span className="inline-flex h-3.5 items-center rounded-xs border border-success/50 px-[3px] text-[11px] font-semibold tracking-wider text-success uppercase">
              {t('piMap.tagHave')}
            </span>
          )}
          {props.ranks.map((rank) => (
            <span
              key={rank}
              className="inline-flex h-3.5 items-center rounded-xs border border-warning/60 px-[3px] text-[11px] font-semibold text-warning"
            >
              #{rank}
            </span>
          ))}
          {props.tracedNeed && !props.tracedNeed.have && (
            <span className="inline-flex h-3.5 items-center rounded-xs border border-danger/50 px-[3px] text-[11px] font-semibold tracking-wider text-danger uppercase">
              {t('piMap.tagNeed')}
            </span>
          )}
          {props.whatIf && (
            <span className="inline-flex h-3.5 items-center rounded-xs border border-map-whatif/60 px-[3px] text-[11px] font-semibold tracking-wider text-map-whatif uppercase">
              {t('piMap.tagWhatIf')}
            </span>
          )}
        </span>
      </button>
    </Tooltip>
  );
}
