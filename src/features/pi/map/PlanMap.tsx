import { LiveStatus, Panel } from '@/components/ui';
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
  pricesFailed?: boolean;
  graph: MapGraph;
  advice: PlanAdvice;
  adviceWithWhatIf: (types: ReadonlySet<PlanetType>) => PlanAdvice | Promise<PlanAdvice>;
  colonies: readonly MapColony[];
  finder: FinderOrigin;
  chainOf?: ChainEstimateOf;
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

      <LiveStatus>{announce}</LiveStatus>
      {s.whatIfChainKey && s.hasFreeSlot && pi && (
        <WhatIfChainsFeed advice={advice} pi={pi} types={s.whatIfTypes} onChange={s.setFed} />
      )}

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
