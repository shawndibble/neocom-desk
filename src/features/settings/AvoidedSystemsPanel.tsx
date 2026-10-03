import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, IconButton, Panel } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { SecurityStatus } from '@/components/SecurityStatus';
import { SolarSystemPicker } from '@/features/route/SolarSystemPicker';
import { useSolarSystems } from '@/features/route/useSolarSystems';
import {
  addAvoidedSystem,
  removeAvoidedSystem,
  useAvoidedSystems,
} from '@/features/route/avoidedSystems';
import { useAvoidedSystemsEnabled } from '@/features/route/routeRules';

/**
 * Settings → Travel: the pilot's Avoided Systems, added through the local
 * solar-system search and removed one row at a time. Each row shows the
 * system's security the way every other system mention in the app does.
 */
export function AvoidedSystemsPanel() {
  const { t } = useTranslation();
  const avoided = useAvoidedSystems((state) => state.value);
  const setAvoided = useAvoidedSystems((state) => state.setValue);
  const hydrated = useAvoidedSystems((state) => state.hydrated);
  const hydrate = useAvoidedSystems((state) => state.hydrate);
  const enabled = useAvoidedSystemsEnabled((state) => state.value);
  const setEnabled = useAvoidedSystemsEnabled((state) => state.setValue);
  const enabledHydrated = useAvoidedSystemsEnabled((state) => state.hydrated);
  const hydrateEnabled = useAvoidedSystemsEnabled((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
    void hydrateEnabled();
  }, [hydrate, hydrateEnabled]);

  const systems = useSolarSystems(true);
  const byId = useMemo(() => new Map(systems?.map((s) => [s.id, s]) ?? []), [systems]);
  const exclude = useMemo(() => new Set(avoided), [avoided]);

  // A system the snapshot cannot name still lists, as `#id`, so it can be removed.
  const rows = useMemo(
    () =>
      avoided
        .map((id) => ({ id, system: byId.get(id) }))
        .sort((a, b) => (a.system?.name ?? `#${a.id}`).localeCompare(b.system?.name ?? `#${b.id}`)),
    [avoided, byId]
  );

  return (
    <Panel title={t('settings.avoidedSystems.title')}>
      {hydrated && enabledHydrated ? (
        <div className="space-y-4">
          <p className="max-w-2xl text-xs text-text-dim">{t('settings.avoidedSystems.hint')}</p>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            {/* Off routes straight through the list without the pilot losing it. */}
            <label className="flex items-center gap-2 text-xs font-semibold">
              <Checkbox checked={enabled} onChange={() => void setEnabled(!enabled)} />
              {t('settings.avoidedSystems.enabled')}
            </label>
            <SolarSystemPicker
              value={null}
              onChange={(systemId) => void setAvoided(addAvoidedSystem(avoided, systemId))}
              ariaLabel={t('settings.avoidedSystems.add')}
              triggerLabel={
                <span className="flex items-center gap-1.5">
                  <Icon.AddRow size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                  {t('settings.avoidedSystems.add')}
                </span>
              }
              exclude={exclude}
              showSecurity
            />
          </div>
          {rows.length === 0 ? (
            <p className="text-xs text-text-dim">{t('settings.avoidedSystems.empty')}</p>
          ) : (
            // Columns rather than one long strip: the names are short and the list can run long.
            <ul
              aria-label={t('settings.avoidedSystems.title')}
              className="grid border-t border-line text-xs sm:grid-cols-2 sm:gap-x-6 xl:grid-cols-3"
            >
              {rows.map(({ id, system }) => {
                const name = system?.name ?? `#${id}`;
                return (
                  <li key={id} className="flex items-center gap-2 border-b border-line px-2 py-1">
                    <span className="flex-1 truncate">
                      {name}
                      {system && <SecurityStatus security={system.security} className="ml-1" />}
                    </span>
                    <IconButton
                      size="sm"
                      variant="plain"
                      icon={<Icon.Close />}
                      label={t('settings.avoidedSystems.remove', { name })}
                      onClick={() => void setAvoided(removeAvoidedSystem(avoided, id))}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </Panel>
  );
}
