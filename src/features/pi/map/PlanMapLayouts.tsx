/** The map panel in its two shapes: desktop (what-if line, board) and phone (rows, full map behind a toggle). */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AssumedCustomsNote } from '../AssumedCustomsNote';
import { assumedCustomsNames } from '../colonyCustoms';
import { Button, Panel } from '@/components/ui';
import { MapLegend, MapLegendTip, PicksStrip, PlanMapBoard, WhatIfLine } from './PlanMapPieces';
import { MapPhone } from './MapPhone';
import type { PlanMapState } from './usePlanMapState';

/** The panel chrome both shapes share: title, legend, help button, customs note, picks strip. */
function MapPanelFrame({ s, children }: { s: PlanMapState; children: ReactNode }) {
  const { t } = useTranslation();
  const { phone, advice, remember, setHelpOpen } = s;
  return (
    <Panel
      title={t('piMap.title')}
      meta={phone ? undefined : <MapLegend s={s} />}
      padded={false}
      actions={
        <span className="inline-flex items-center gap-2">
          {phone && <MapLegendTip s={s} />}
          <Button
            size={phone ? 'md' : 'sm'}
            aria-haspopup="dialog"
            onClick={() => {
              remember();
              setHelpOpen(true);
            }}
          >
            {t(phone ? 'piMap.helpShort' : 'piMap.helpButton')}
          </Button>
        </span>
      }
    >
      <AssumedCustomsNote
        className="border-b border-line px-3 py-1.5"
        names={assumedCustomsNames(advice.colonies, (id) => t('pi.planetLabel', { id }))}
      />
      <PicksStrip s={s} />
      {children}
    </Panel>
  );
}

export function DesktopMapPanel({ s }: { s: PlanMapState }) {
  return (
    <MapPanelFrame s={s}>
      <WhatIfLine s={s} />
      <PlanMapBoard s={s} />
    </MapPanelFrame>
  );
}

export function PhoneMapPanel({ s }: { s: PlanMapState }) {
  const {
    graph,
    owned,
    noColonies,
    litTicked,
    whatIf,
    litIds,
    newIds,
    traced,
    pickRanks,
    figureOf,
    clickPlanet,
    toggleProduct,
    productHref,
  } = s;
  return (
    <MapPanelFrame s={s}>
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
        between={
          <div className="-mx-3">
            <WhatIfLine s={s} />
          </div>
        }
        fullMap={<PlanMapBoard s={s} />}
      />
    </MapPanelFrame>
  );
}
