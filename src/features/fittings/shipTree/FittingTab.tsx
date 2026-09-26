/**
 * Ship Info › Fitting: the hull's slots, hardpoints and fitting resources
 * as CCP ships them (before the pilot's skills), and Simulate — a new,
 * empty Fitting of the hull in the editor.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { newFitting } from '@/engine/fittings/fittingEdit';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import { formatAttributeValue } from '@/features/market/format';
import type { ShipTreeShip } from '@/sde/types';
import { fittingEditLocation } from '../fittingRoutes';

/** T3 cruisers ship no slots of their own: the fitted subsystems add them. */
function slotsFromSubsystems(ship: ShipTreeShip): boolean {
  const { highSlots, medSlots, lowSlots } = ship.stats;
  return ship.techLevel === 3 && highSlots + medSlots + lowSlots === 0;
}

export function FittingTab({ ship }: { ship: ShipTreeShip }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const s = ship.stats;

  const rows: [string, string][] = [];
  if (!slotsFromSubsystems(ship)) {
    rows.push(
      [t('ships.info.fitting.highSlots'), formatAttributeValue(s.highSlots)],
      [t('ships.info.fitting.medSlots'), formatAttributeValue(s.medSlots)],
      [t('ships.info.fitting.lowSlots'), formatAttributeValue(s.lowSlots)]
    );
  }
  rows.push([
    t('ships.info.fitting.rigSlots'),
    s.rigSlots > 0 && s.rigSize > 0
      ? t('ships.info.fitting.rigSlotsSized', {
          count: s.rigSlots,
          size: t(`ships.info.fitting.rigSize.${s.rigSize}`),
        })
      : formatAttributeValue(s.rigSlots),
  ]);
  if (!slotsFromSubsystems(ship)) {
    rows.push(
      [t('ships.info.fitting.turrets'), formatAttributeValue(s.turretHardpoints)],
      [t('ships.info.fitting.launchers'), formatAttributeValue(s.launcherHardpoints)]
    );
  }
  rows.push(
    [
      t('ships.info.fitting.cpu'),
      t('ships.info.fitting.tf', { value: formatAttributeValue(s.cpu) }),
    ],
    [
      t('ships.info.fitting.powergrid'),
      t('ships.info.fitting.mw', { value: formatAttributeValue(s.powergrid) }),
    ],
    [t('ships.info.fitting.calibration'), formatAttributeValue(s.calibration)],
    [
      t('ships.info.fitting.droneBay'),
      t('ships.info.fitting.m3', { value: formatAttributeValue(s.droneBay) }),
    ],
    [
      t('ships.info.fitting.droneBandwidth'),
      t('ships.info.fitting.mbit', { value: formatAttributeValue(s.droneBandwidth) }),
    ]
  );

  async function simulate() {
    setBusy(true);
    setFailed(false);
    try {
      const encoded = await encodeFittingShare(
        fittingToShareInput(newFitting(ship.typeID, ship.name))
      );
      if (encoded.ok) navigate(fittingEditLocation(encoded.payload));
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-xs">
      {slotsFromSubsystems(ship) && (
        <p className="text-text-dim">{t('ships.info.fitting.subsystems')}</p>
      )}
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-text-dim">{label}</dt>
            <dd className="text-right text-text tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-text-dim">{t('ships.info.fitting.unskilledNote')}</p>
      <Button variant="primary" onClick={() => void simulate()} disabled={busy}>
        {t('ships.info.fitting.simulate')}
      </Button>
      {failed && (
        <p role="alert" className="text-danger">
          {t('ships.info.fitting.simulateFailed')}
        </p>
      )}
    </div>
  );
}
