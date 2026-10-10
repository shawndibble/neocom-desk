/**
 * The Ship Tree as the game draws it (desktop default): one faction's tree
 * in a pan/zoom world — drag to pan, wheel or pinch to zoom around the
 * pointer/fingers, Fit for the whole tree. Geometry is `layoutShipTree`'s;
 * this only draws it. Hovering a hull shows the in-game hover card; clicking
 * one opens the Ship Info window (the caller's).
 */
import { useGesture } from '@use-gesture/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { ShipTreeEdge, ShipTreeHullStatus, ShipTreeLayout } from '@/engine/shipTree/types';
import type { ShipTreeFaction, ShipTreeShip } from '@/sde/types';
import { ClassNode } from './ClassNode';
import { HoverCard } from './HoverCard';
import { FactionGrid } from './FactionGrid';
import { Legend } from './Legend';
import { MapLines } from './MapLines';
import { MapSearch } from './MapSearch';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  fitCamera,
  focusCamera,
  initialCamera,
  wheelZoomFactor,
  zoomAround,
  type Camera,
  type Size,
} from './mapCamera';
import { factionEmblemUrl } from './shipTreeAssets';
import { factionNameOf, flyableCount } from './shipTreeModel';
import type { FactionTree } from './useFactionTree';
import type { ShipTreeSource } from './useShipTreeData';

const BUTTON_STEP = 1.2;

/** The faction panel's 14.5rem plus its 0.75rem inset and a gap. */
const FACTION_PANEL_SPACE = 256;
const MIN_FIT_WIDTH = 480;
/** Long enough to cross the gap from a tile to its hover card. */
const HOVER_CLOSE_DELAY_MS = 150;

export function ShipTreeMap({
  source,
  tree,
  selectedTypeID,
  onFaction,
  onOpenShip,
  viewSwitch,
  showFactionGrid,
}: {
  source: ShipTreeSource;
  tree: FactionTree;
  selectedTypeID: number | null;
  onFaction: (factionID: number) => void;
  onOpenShip: (ship: ShipTreeShip) => void;
  viewSwitch: ReactNode;
  /** The in-canvas faction panel; a phone's map is too small and keeps the bar above. */
  showFactionGrid: boolean;
}) {
  const { t } = useTranslation();
  const { data, statuses, trainedLevel, skillName } = source;
  const factionID = tree.factionID;
  const [showNames, setShowNames] = useState(false);
  const [hover, setHover] = useState<{ ship: ShipTreeShip; rect: DOMRect } | null>(null);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  // Fit beside the faction panel when the canvas is wide enough to spare it.
  const fitInset =
    showFactionGrid && viewport.width - FACTION_PANEL_SPACE >= MIN_FIT_WIDTH
      ? FACTION_PANEL_SPACE
      : 0;
  // A camera the reader moved, for the faction they moved it on; any other
  // faction starts at 100% (or centred on the hull search picked there).
  const [moved, setMoved] = useState<{ factionID: number; cam: Camera } | null>(null);
  const [focus, setFocus] = useState<{ factionID: number; typeID: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const layout = tree.layout;
  const nodeById = useMemo(() => new Map(layout.nodes.map((n) => [n.def.id, n])), [layout]);
  const world = useMemo(() => ({ width: layout.width, height: layout.height }), [layout]);

  const focusShip = focus?.factionID === factionID ? focus.typeID : null;
  const focusNode = useMemo(() => {
    if (focusShip === null) return null;
    const ship = data.ships.find((s) => s.typeID === focusShip);
    return ship ? (nodeById.get(ship.treeGroupID) ?? null) : null;
  }, [focusShip, data, nodeById]);

  const initial = initialCamera(world, viewport, fitInset);
  const cam =
    moved?.factionID === factionID
      ? moved.cam
      : focusNode
        ? focusCamera(focusNode, viewport, initial.z)
        : initial;

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const measure = () => setViewport({ width: vp.clientWidth, height: vp.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(vp);
    return () => observer.disconnect();
  }, []);

  const moveTo = (next: Camera) => setMoved({ factionID, cam: next });
  const zoomBy = (factor: number) =>
    moveTo(zoomAround(cam, factor, viewport.width / 2, viewport.height / 2));

  // Drag pans, wheel and pinch zoom around the pointer/fingers — one gesture
  // layer for mouse, trackpad and touch (incl. two-finger pinch on a
  // touchscreen). Bound straight to the viewport node so wheel/touch can
  // preventDefault (React's synthetic handlers are passive).
  useGesture(
    {
      onDragStart: ({ event, cancel }) => {
        if ((event.target as HTMLElement).closest('button')) return cancel();
        setHover(null);
      },
      onDrag: ({ pinching, cancel, delta: [dx, dy] }) => {
        if (pinching) return cancel();
        moveTo({ ...cam, x: cam.x + dx, y: cam.y + dy });
      },
      onWheel: ({ delta: [, dy], event }) => {
        event.preventDefault();
        if (dy === 0) return;
        setHover(null);
        const rect = viewportRef.current!.getBoundingClientRect();
        const wheelEvent = event as WheelEvent;
        moveTo(
          zoomAround(
            cam,
            wheelZoomFactor(dy),
            wheelEvent.clientX - rect.left,
            wheelEvent.clientY - rect.top
          )
        );
      },
      onPinchStart: () => setHover(null),
      onPinch: ({ origin: [ox, oy], offset: [z], event }) => {
        event.preventDefault();
        const rect = viewportRef.current!.getBoundingClientRect();
        const factor = z / cam.z;
        if (factor !== 1) moveTo(zoomAround(cam, factor, ox - rect.left, oy - rect.top));
      },
    },
    {
      target: viewportRef,
      eventOptions: { passive: false },
      pinch: { scaleBounds: { min: MIN_ZOOM, max: MAX_ZOOM }, from: () => [cam.z, 0] },
    }
  );

  // Stable, so a pan or a hover re-renders only the transform, not the world.
  const switchFaction = useCallback(
    (id: number) => {
      setHover(null);
      onFaction(id);
    },
    [onFaction]
  );
  const selectShip = useCallback(
    (ship: ShipTreeShip) => {
      setHover(null);
      onOpenShip(ship);
    },
    [onOpenShip]
  );
  // Leaving the tile closes the card after a beat, so the pointer can cross
  // the gap onto the card (WCAG 1.4.13 "hoverable"); the card cancels it.
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cancelClose = useCallback(() => clearTimeout(closeTimer.current), []);
  const hoverShip = useCallback((ship: ShipTreeShip | null, el?: HTMLElement) => {
    clearTimeout(closeTimer.current);
    if (ship && el) setHover({ ship, rect: el.getBoundingClientRect() });
    else closeTimer.current = setTimeout(() => setHover(null), HOVER_CLOSE_DELAY_MS);
  }, []);
  const closeHoverNow = useCallback(() => {
    clearTimeout(closeTimer.current);
    setHover(null);
  }, []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  // Escape dismisses the card without moving the pointer (WCAG 1.4.13 "dismissible").
  const hoverOpen = hover !== null;
  useEffect(() => {
    if (!hoverOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeHoverNow();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hoverOpen, closeHoverNow]);

  function pickResult(ship: ShipTreeShip) {
    setHover(null);
    setFocus({ factionID: ship.factionID, typeID: ship.typeID });
    if (ship.factionID !== factionID) {
      onFaction(ship.factionID);
    } else {
      const node = nodeById.get(ship.treeGroupID);
      if (node) moveTo(focusCamera(node, viewport, cam.z));
    }
    onOpenShip(ship);
  }

  const { flyable, total } = useMemo(
    () =>
      flyableCount(
        data.ships.filter((s) => s.factionID === factionID),
        statuses
      ),
    [data, factionID, statuses]
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {viewSwitch}
        <MapSearch data={data} statuses={statuses} onPick={pickResult} />
        <span className="text-xs text-text-dim">
          {t('ships.tree.flyableCount', { flyable, total })}
        </span>
        <span className="flex-1" />
        <IconButton
          size="sm"
          icon={<Icon.ShowLabels />}
          label={t('ships.tree.showNames')}
          pressed={showNames}
          onClick={() => setShowNames((v) => !v)}
        />
        <IconButton
          size="sm"
          icon={<Icon.ZoomOut />}
          label={t('ships.tree.zoomOut')}
          disabled={cam.z <= MIN_ZOOM}
          onClick={() => zoomBy(1 / BUTTON_STEP)}
        />
        <span
          className="w-10 text-center text-xs text-text-dim tabular-nums"
          aria-label={t('ships.tree.zoomLevel')}
        >
          {Math.round(cam.z * 100)}%
        </span>
        <IconButton
          size="sm"
          icon={<Icon.ZoomIn />}
          label={t('ships.tree.zoomIn')}
          disabled={cam.z >= MAX_ZOOM}
          onClick={() => zoomBy(BUTTON_STEP)}
        />
        <Tooltip content={t('ships.tree.fitLabel')}>
          <Button
            size="sm"
            onClick={() => {
              setFocus(null);
              moveTo(fitCamera(world, viewport, fitInset));
            }}
          >
            {t('ships.tree.fit')}
          </Button>
        </Tooltip>
      </div>

      <div
        ref={viewportRef}
        role="region"
        aria-label={t('ships.tree.mapLabel', { faction: factionNameOf(data.factions, factionID) })}
        data-testid="ship-tree-map"
        data-zoom={cam.z.toFixed(2)}
        className="isis-viewport relative h-[calc(100dvh-17rem)] min-h-[28rem] cursor-grab touch-none overflow-hidden rounded-xs border border-line active:cursor-grabbing"
        style={{
          backgroundSize: `${40 * cam.z}px ${40 * cam.z}px`,
          backgroundPosition: `${cam.x}px ${cam.y}px`,
        }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`,
          }}
        >
          <MapWorld
            layout={layout}
            tree={tree}
            factions={data.factions}
            statuses={statuses}
            trainedLevel={trainedLevel}
            skillName={skillName}
            selectedTypeID={selectedTypeID}
            showNames={showNames}
            onFaction={switchFaction}
            onSelect={selectShip}
            onHover={hoverShip}
          />
        </div>
        {showFactionGrid && (
          <FactionGrid
            data={data}
            factionID={factionID}
            statuses={statuses}
            onFaction={switchFaction}
          />
        )}
        <div
          className="isis-overlay pointer-events-none absolute right-3 bottom-3 z-10 px-2.5 py-1.5"
          data-testid="ship-tree-legend"
        >
          <Legend className="max-w-[16rem]" />
        </div>
      </div>
      {hover && hover.ship.factionID === factionID && (
        <HoverCard
          ship={hover.ship}
          anchor={hover.rect}
          className={data.groups[String(hover.ship.treeGroupID)]?.name ?? ''}
          skillName={skillName}
          onPointerEnter={cancelClose}
          onPointerLeave={closeHoverNow}
        />
      )}
    </div>
  );
}

/**
 * Everything inside the scaled world: lines, pirate emblems and classes.
 * Memoised on stable props, so panning and zooming (the transform around
 * it) and the hover card never re-render the tiles.
 */
const MapWorld = memo(function MapWorld({
  layout,
  tree,
  factions,
  statuses,
  trainedLevel,
  skillName,
  selectedTypeID,
  showNames,
  onFaction,
  onSelect,
  onHover,
}: {
  layout: ShipTreeLayout;
  tree: FactionTree;
  factions: readonly ShipTreeFaction[];
  statuses: ReadonlyMap<number, ShipTreeHullStatus>;
  trainedLevel: (skillTypeID: number) => number;
  skillName: (skillTypeID: number) => string;
  selectedTypeID: number | null;
  showNames: boolean;
  onFaction: (factionID: number) => void;
  onSelect: (ship: ShipTreeShip) => void;
  onHover: (ship: ShipTreeShip | null, el?: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  const lit = useCallback((e: ShipTreeEdge) => tree.unlocked(e.childId), [tree]);
  // Only the class holding the selected hull gets it, so a new selection
  // re-renders two classes, not all of them.
  const selectedClassId = useMemo(() => {
    for (const [classId, ships] of tree.hulls) {
      if (ships.some((s) => s.typeID === selectedTypeID)) return classId;
    }
    return null;
  }, [tree, selectedTypeID]);
  return (
    <>
      <MapLines layout={layout} lit={lit} />
      {layout.emblems.map((e, i) => {
        const emblem = factionEmblemUrl(e.factionID);
        const name = factionNameOf(factions, e.factionID);
        return (
          <Tooltip key={`eb${i}`} content={name}>
            <button
              type="button"
              className="isis-emblem"
              style={{ left: e.x, top: e.y }}
              aria-label={t('ships.tree.switchFaction', { name })}
              onClick={() => onFaction(e.factionID)}
            >
              {emblem && (
                <img
                  src={emblem}
                  alt=""
                  width={22}
                  height={22}
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                />
              )}
            </button>
          </Tooltip>
        );
      })}
      {layout.nodes.map((n) => (
        <ClassNode
          key={n.def.id}
          node={n}
          tree={tree}
          statuses={statuses}
          trainedLevel={trainedLevel}
          skillName={skillName}
          selectedTypeID={n.def.id === selectedClassId ? selectedTypeID : null}
          showNames={showNames}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </>
  );
});
