import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { ItemInfoLink } from '@/features/entities';
import { FITTING_SLOT_KINDS, type Fitting } from '@/engine/fittings/types';

interface FittingModuleListProps {
  fitting: Fitting;
  typeName: (typeId: number) => string;
  /** Given: the list sits in a titled Panel. Absent: bare, for a caller that frames it itself. */
  title?: string;
  /** Names link to the Market browser. Needs a Router; off for the logged-out share page. */
  linkNames?: boolean;
}

/**
 * Plain-text module/drone/cargo list by rack — nothing editable. The Share
 * Link's read-only view shows it beside `FittingRing`'s icons; Pilot Lookup
 * shows a killmail victim's fit with it. Null for an empty Fitting.
 */
export function FittingModuleList({
  fitting,
  typeName,
  title,
  linkNames = false,
}: FittingModuleListProps) {
  const { t } = useTranslation();
  const name = (typeId: number) =>
    linkNames ? <ItemInfoLink typeId={typeId}>{typeName(typeId)}</ItemInfoLink> : typeName(typeId);

  const groups = FITTING_SLOT_KINDS.map((rack) => ({
    rack,
    modules: fitting.modules.filter((module) => module.slot === rack),
  })).filter((group) => group.modules.length > 0);

  if (groups.length === 0 && fitting.drones.length === 0 && fitting.cargo.length === 0) {
    return null;
  }

  const list = (
    <div className="space-y-3 text-xs">
      {groups.map(({ rack, modules }) => (
        <div key={rack}>
          <p className="font-semibold tracking-widest text-text-dim uppercase">
            {t(`fittings.list.rack.${rack}`)}
          </p>
          <ul>
            {modules.map((module, index) => (
              <li key={index}>
                {name(module.typeId)}
                {module.chargeTypeId !== undefined && <> — {name(module.chargeTypeId)}</>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {fitting.drones.length > 0 && (
        <div>
          <p className="font-semibold tracking-widest text-text-dim uppercase">
            {t('fittings.list.drones')}
          </p>
          <ul>
            {fitting.drones.map((drone, index) => (
              <li key={index}>
                {name(drone.typeId)} x{drone.quantity}
              </li>
            ))}
          </ul>
        </div>
      )}
      {fitting.cargo.length > 0 && (
        <div>
          <p className="font-semibold tracking-widest text-text-dim uppercase">
            {t('fittings.list.cargo')}
          </p>
          <ul>
            {fitting.cargo.map((item, index) => (
              <li key={index}>
                {name(item.typeId)} x{item.quantity}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return title === undefined ? list : <Panel title={title}>{list}</Panel>;
}
