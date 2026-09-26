/**
 * The Ship Tree as the game draws it (desktop default): one faction's tree
 * in a pan/zoom world — drag to pan, wheel to zoom around the pointer, Fit
 * for the whole tree. Geometry is `layoutShipTree`'s; this only draws it.
 * Hovering a hull shows the in-game hover card; clicking one opens the
 * Ship Info window (the caller's).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { layoutShipTree, hullCountsFor } from '@/engine/shipTree/layout';
import type { ShipTreeEdge } from '@/engine/shipTree/types';
import { cx } from '@/lib/cx';
import type { ShipTreeShip } from '@/sde/types';
import { ClassNode } from './ClassNode';
import { HoverCard } from './HoverCard';
import { Legend } from './Legend';
import { MapLines } from './MapLines';
import { MapSearch } from './MapSearch';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  fitCamera,
  focusCamera,
  zoomAround,
  type Camera,
  type Size,
} from './mapCamera';
import { factionEmblemUrl } from './shipTreeAssets';
import type { FactionTree } from './useFactionTree';
import type { ShipTreeSource } from './useShipTreeData';

const WHEEL_STEP = 1.12;
const BUTTON_STEP = 1.2;
const toolButton = 'rounded-xs border border-line px-2 py-1 text-xs hover:border-line-bright';

export function ShipTreeMap({
  source,
  tree,
  selectedTypeID,
  onFaction,
  onOpenShip,
  viewSwitch,
}: {
  source: ShipTreeSource;
  tree: FactionTree;
  selectedTypeID: number | null;
  onFaction: (factionID: number) => void;
  onOpenShip: (ship: ShipTreeShip) => void;
  viewSwitch: ReactNode;
}) {
  const { t } = useTranslation();
  const { data, statuses, trainedLevel, skillName } = source;
  const factionID = tree.factionID;
  const [showNames, setShowNames] = useState(false);
  const [hover, setHover] = useState<{ ship: ShipTreeShip; rect: DOMRect } | null>(null);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  // A camera the reader moved, for the faction they moved it on; any other
  // faction starts from Fit (or centred on the hull search picked there).
  const [moved, setMoved] = useState<{ factionID: number; cam: Camera } | null>(null);
  const [focus, setFocus] = useState<{ factionID: number; typeID: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; cam: Camera } | null>(null);

  const layout = useMemo(
    () =>
      layoutShipTree({
        factionID,
        defs: tree.defs,
        hullCounts: hullCountsFor(data, factionID),
        needsOmega: tree.needsOmega,
        parentEmpires: tree.parentEmpires,
      }),
    [data, factionID, tree]
  );
  const nodeById = useMemo(() => new Map(layout.nodes.map((n) => [n.def.id, n])), [layout]);
  const world = useMemo(() => ({ width: layout.width, height: layout.height }), [layout]);

  const focusShip = focus?.factionID === factionID ? focus.typeID : null;
  const focusNode = useMemo(() => {
    if (focusShip === null) return null;
    const ship = data.ships.find((s) => s.typeID === focusShip);
    return ship ? (nodeById.get(ship.treeGroupID) ?? null) : null;
  }, [focusShip, data, nodeById]);

  const fitted = fitCamera(world, viewport);
  const cam =
    moved?.factionID === factionID
      ? moved.cam
      : focusNode
        ? focusCamera(focusNode, viewport, fitted.z)
        : fitted;

  // The wheel listener is bound once; it reads the camera as last drawn.
  const latest = useRef({ cam, factionID });
  useLayoutEffect(() => {
    latest.current = { cam, factionID };
  });

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const measure = () => setViewport({ width: vp.clientWidth, height: vp.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(vp);
    return () => observer.disconnect();
  }, []);

  // React's onWheel is passive, so preventDefault needs a raw listener.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      setHover(null);
      const rect = vp!.getBoundingClientRect();
      const { cam: current, factionID: id } = latest.current;
      const factor = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      setMoved({
        factionID: id,
        cam: zoomAround(current, factor, e.clientX - rect.left, e.clientY - rect.top),
      });
    }
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, []);

  const moveTo = (next: Camera) => setMoved({ factionID, cam: next });
  const zoomBy = (factor: number) =>
    moveTo(zoomAround(cam, factor, viewport.width / 2, viewport.height / 2));

  function switchFaction(id: number) {
    setHover(null);
    onFaction(id);
  }

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

  const lit = (e: ShipTreeEdge) => tree.unlocked(e.childId);
  const factionShips = data.ships.filter((s) => s.factionID === factionID);
  const flyable = factionShips.filter((s) => statuses.get(s.typeID)?.canFly).length;
  const factionName = (id: number) => data.factions.find((f) => f.id === id)?.name ?? '';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {viewSwitch}
        <MapSearch data={data} statuses={statuses} onPick={pickResult} />
        <span className="text-xs text-text-dim">
          {t('ships.tree.flyableCount', { flyable, total: factionShips.length })}
        </span>
        <span className="flex-1" />
        <Legend />
        <button
          type="button"
          onClick={() => setShowNames((v) => !v)}
          aria-pressed={showNames}
          aria-label={t('ships.tree.showNames')}
          title={t('ships.tree.showNames')}
          className={cx(
            'rounded-xs border px-2 py-1 text-xs',
            showNames ? 'border-accent text-accent' : 'border-line text-text-dim'
          )}
        >
          Aa
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / BUTTON_STEP)}
          disabled={cam.z <= MIN_ZOOM}
          aria-label={t('ships.tree.zoomOut')}
          className={toolButton}
        >
          −
        </button>
        <span
          className="w-10 text-center text-xs text-text-dim tabular-nums"
          aria-label={t('ships.tree.zoomLevel')}
        >
          {Math.round(cam.z * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomBy(BUTTON_STEP)}
          disabled={cam.z >= MAX_ZOOM}
          aria-label={t('ships.tree.zoomIn')}
          className={toolButton}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            setFocus(null);
            moveTo(fitCamera(world, viewport));
          }}
          title={t('ships.tree.fitLabel')}
          className={toolButton}
        >
          {t('ships.tree.fit')}
        </button>
      </div>

      <div
        ref={viewportRef}
        role="region"
        aria-label={t('ships.tree.mapLabel', { faction: factionName(factionID) })}
        data-testid="ship-tree-map"
        data-zoom={cam.z.toFixed(2)}
        className="isis-viewport relative h-[calc(100dvh-17rem)] min-h-[28rem] cursor-grab touch-none overflow-hidden rounded-xs border border-line active:cursor-grabbing"
        style={{
          backgroundSize: `${40 * cam.z}px ${40 * cam.z}px`,
          backgroundPosition: `${cam.x}px ${cam.y}px`,
        }}
        onPointerDown={(e) => {
          setHover(null);
          if ((e.target as HTMLElement).closest('button')) return;
          drag.current = { x: e.clientX, y: e.clientY, cam };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          moveTo({ ...d.cam, x: d.cam.x + e.clientX - d.x, y: d.cam.y + e.clientY - d.y });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
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
          <MapLines layout={layout} lit={lit} />
          {layout.emblems.map((e, i) => {
            const emblem = factionEmblemUrl(e.factionID);
            return (
              <button
                key={`eb${i}`}
                type="button"
                className="isis-emblem"
                style={{ left: e.x, top: e.y }}
                title={factionName(e.factionID)}
                aria-label={t('ships.tree.switchFaction', { name: factionName(e.factionID) })}
                onClick={() => switchFaction(e.factionID)}
              >
                {emblem && <img src={emblem} alt="" width={22} height={22} draggable={false} />}
              </button>
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
              selectedTypeID={selectedTypeID}
              showNames={showNames}
              onSelect={(ship) => {
                setHover(null);
                onOpenShip(ship);
              }}
              onHover={(ship, el) =>
                setHover(ship && el ? { ship, rect: el.getBoundingClientRect() } : null)
              }
            />
          ))}
        </div>
      </div>
      {hover && hover.ship.factionID === factionID && (
        <HoverCard
          ship={hover.ship}
          anchor={hover.rect}
          className={data.groups[String(hover.ship.treeGroupID)]?.name ?? ''}
          skillName={skillName}
        />
      )}
    </div>
  );
}
