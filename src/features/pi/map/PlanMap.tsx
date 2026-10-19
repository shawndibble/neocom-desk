/**
 * The PI Map tab's body: the map panel ("Your picks", the how-to and what-if
 * line, the board) and the detail panel beside or over it.
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

import { Panel } from '@/components/ui';
import { useTranslation } from 'react-i18next';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { cx } from '@/lib/cx';
import type { PlanAdvice } from '../planAdviceModel';
import type { PiData } from '@/sde/types';
import { WhatIfChainsFeed } from './WhatIfChainsFeed';
import type { ChainEstimateOf } from '../useChainEstimates';
import { type FinderOrigin } from './MapDetail';
import { MapHelp } from './MapHelp';
import { PiDrawer } from './PiDrawer';
import { type MapGraph } from './mapModel';
import { PlanMapDetailBody } from './PlanMapPieces';
import { DesktopMapPanel, PhoneMapPanel } from './PlanMapLayouts';
import { usePlanMapState } from './usePlanMapState';

export interface MapColony {
  planetId: number;
  type: PlanetType;
  name: string;
}

export interface PlanMapProps {
  /** Hub prices could not be read: `advice` is unpriced, so "your planets already make their best" cannot be said. */
  pricesFailed?: boolean;
  graph: MapGraph;
  advice: PlanAdvice;
  /** The same advice with these planet types added as what-ifs: priced for them, never for the picks. */
  adviceWithWhatIf: (types: ReadonlySet<PlanetType>) => PlanAdvice | Promise<PlanAdvice>;
  colonies: readonly MapColony[];
  finder: FinderOrigin;
  /** P3/P4 multi-planet chain estimates (`useChainEstimates`); none when left out. */
  chainOf?: ChainEstimateOf;
  /** The PI data, for what-if Bigger chains; none are priced when left out. */
  pi?: PiData | null;
}

export function PlanMap(props: PlanMapProps) {
  const { t } = useTranslation();
  const s = usePlanMapState(props);
  const { layoutRef, mode, docked, phone, detailTitle, announce, advice, pi } = s;
  const detailBody = <PlanMapDetailBody s={s} />;

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
        {phone ? <PhoneMapPanel s={s} /> : <DesktopMapPanel s={s} />}
        {docked && (
          <aside aria-label={detailTitle} className="sticky top-3">
            <Panel title={detailTitle}>{detailBody}</Panel>
          </aside>
        )}
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>
      {s.whatIfChainKey && s.hasFreeSlot && pi && (
        <WhatIfChainsFeed advice={advice} pi={pi} types={s.whatIfTypes} onChange={s.setFed} />
      )}

      {/* One drawer for both, so swapping planet for product never closes it
          (a close hands focus back to the opener). The URL backs the product's. */}
      <PiDrawer
        open={s.drawerShown}
        onClose={s.richnessShown ? s.dropPlanet : s.productShown ? s.dropProduct : s.closePlanet}
        title={detailTitle}
        phone={phone}
        closeOnBack={!s.productShown && !s.richnessShown}
        returnFocusFallback={s.productFocusFallback}
      >
        {detailBody}
      </PiDrawer>
      <PiDrawer open={s.helpOpen} onClose={s.closeHelp} title={t('piMap.help.title')} phone={phone}>
        <MapHelp />
      </PiDrawer>
    </>
  );
}
