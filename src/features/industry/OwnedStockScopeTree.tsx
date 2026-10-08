import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret, Checkbox } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import type { OwnedStockLocation, OwnedStockScope } from '@/engine/industry/ownedStock';
import {
  isContainerChecked,
  isHangarChecked,
  stationState,
  toggleContainer,
  toggleHangar,
  toggleStation,
  type ScopeCheckState,
  type ScopeTreeStation,
} from '@/engine/industry/ownedStockScopeTree';

interface OwnedStockScopeTreeProps {
  stations: readonly ScopeTreeStation[];
  scope: OwnedStockScope | undefined;
  onChange: (scope: OwnedStockScope) => void;
  labelFor: (location: OwnedStockLocation) => string;
}

/** A native checkbox whose partial state is the DOM `indeterminate` flag, which has no attribute. */
function TriCheckbox({
  state,
  label,
  onToggle,
}: {
  state: ScopeCheckState;
  label: string;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'partial';
  }, [state]);
  return (
    <label className={`flex min-w-0 flex-1 items-center gap-2 ${tappableRowClassName}`}>
      <Checkbox
        ref={ref}
        checked={state === 'checked'}
        aria-checked={state === 'partial' ? 'mixed' : state === 'checked'}
        onChange={onToggle}
        aria-label={label}
      />
      <span className="min-w-0 truncate text-xs">{label}</span>
    </label>
  );
}

/**
 * Stations with a caret and a tri-state checkbox; corp hangars 1-7 and
 * containers nest under their station (issue #2941). Pure drawing: every
 * selection rule lives in `ownedStockScopeTree`.
 */
export function OwnedStockScopeTree({
  stations,
  scope,
  onChange,
  labelFor,
}: OwnedStockScopeTreeProps) {
  const { t } = useTranslation();
  // A station already narrowed opens on its children, so a saved scope shows what it picked.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(stations.filter((s) => stationState(scope, s) === 'partial').map((s) => s.key))
  );
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const corp = stations.filter((s) => s.location.corporationId !== undefined);
  const personal = stations.filter((s) => s.location.corporationId === undefined);

  const renderStation = (station: ScopeTreeStation) => {
    const hasChildren = station.hangars.length + station.containers.length > 0;
    const open = expanded.has(station.key);
    const label = labelFor(station.location);
    return (
      <li key={station.key} role="treeitem" aria-expanded={hasChildren ? open : undefined}>
        <div className="flex items-center gap-1">
          {hasChildren ? (
            <button
              type="button"
              aria-label={t(
                open ? 'industry.ownedStockScopeCollapse' : 'industry.ownedStockScopeExpand',
                {
                  location: label,
                }
              )}
              aria-expanded={open}
              onClick={() => toggleExpanded(station.key)}
              className="grid min-h-11 w-6 shrink-0 place-items-center md:min-h-7 touch:min-h-11"
            >
              <Caret expanded={open} />
            </button>
          ) : (
            <span className="w-6 shrink-0" aria-hidden="true" />
          )}
          <TriCheckbox
            state={stationState(scope, station)}
            label={label}
            onToggle={() => onChange(toggleStation(scope, station))}
          />
        </div>
        {hasChildren && open && (
          <ul role="group" className="ml-7 border-l border-line pl-2">
            {station.hangars.map((division) => (
              <li key={`h${division}`} role="treeitem">
                <TriCheckbox
                  state={isHangarChecked(scope, station, division) ? 'checked' : 'empty'}
                  label={t('industry.ownedStockScopeHangar', { division })}
                  onToggle={() => onChange(toggleHangar(scope, station, division))}
                />
              </li>
            ))}
            {station.containers.map((container) => (
              <li key={`c${container.containerId}`} role="treeitem">
                <TriCheckbox
                  state={isContainerChecked(scope, station, container) ? 'checked' : 'empty'}
                  label={t('industry.ownedStockScopeContainer', { id: container.containerId })}
                  onToggle={() => onChange(toggleContainer(scope, station, container.containerId))}
                />
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  // Grouped only once a corp station exists: a lone "Personal" header would be noise.
  const group = (heading: string | null, list: readonly ScopeTreeStation[]) =>
    list.length === 0 ? null : (
      <li key={heading ?? 'all'} role="none">
        {heading && (
          <p className="px-1 pt-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {heading}
          </p>
        )}
        <ul role="group">{list.map(renderStation)}</ul>
      </li>
    );

  return (
    <ul role="tree" aria-label={t('industry.ownedStockScopeLabel')} className="flex flex-col">
      {corp.length === 0
        ? group(null, personal)
        : [
            group(t('industry.ownedStockScopeGroupPersonal'), personal),
            group(t('industry.ownedStockScopeGroupCorp'), corp),
          ]}
    </ul>
  );
}
