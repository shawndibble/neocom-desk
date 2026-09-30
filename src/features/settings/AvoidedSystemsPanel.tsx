import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Panel } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { SecurityStatus } from '@/components/SecurityStatus';
import { SolarSystemPicker } from '@/features/route/SolarSystemPicker';
import { useSolarSystems } from '@/features/route/useSolarSystems';
import {
  addAvoidedSystem,
  removeAvoidedSystem,
  useAvoidedSystems,
} from '@/features/route/avoidedSystems';

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
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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
      {hydrated ? (
        <div className="max-w-md space-y-4">
          <p className="text-xs text-text-dim">{t('settings.avoidedSystems.hint')}</p>
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
          {rows.length === 0 ? (
            <p className="text-text-dim">{t('settings.avoidedSystems.empty')}</p>
          ) : (
            <ul
              aria-label={t('settings.avoidedSystems.title')}
              className="divide-y divide-line rounded-sm border border-line"
            >
              {rows.map(({ id, system }) => {
                const name = system?.name ?? `#${id}`;
                return (
                  <li key={id} className="flex items-center gap-2 px-2 py-1">
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
