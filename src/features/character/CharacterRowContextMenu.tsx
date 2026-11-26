import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MenuItem, MenuSeparator, RowActionsMenu } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';

export interface CharacterRowContextMenuProps {
  characterId: number;
  name: string;
  spFarm?: boolean;
  onToggleSpFarm?: () => void;
  onRemove: () => void;
  children: ReactElement;
}

const DESTINATIONS = [
  { path: '/overview', labelKey: 'nav.overview' },
  { path: '/skills/trained', labelKey: 'nav.skills' },
  { path: '/industry', labelKey: 'nav.industry' },
  { path: '/planetary-industry', labelKey: 'nav.pi' },
  { path: '/alerts', labelKey: 'nav.alerts' },
] as const;

export function CharacterRowContextMenu({
  characterId,
  name,
  spFarm,
  onToggleSpFarm,
  onRemove,
  children,
}: CharacterRowContextMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setActiveCharacter = useActiveCharacter((state) => state.setActiveCharacter);

  async function go(path: string) {
    await setActiveCharacter(characterId);
    navigate(path);
  }

  return (
    <RowActionsMenu
      name={name}
      items={
        <>
          {DESTINATIONS.map((destination) => (
            <MenuItem key={destination.path} onSelect={() => void go(destination.path)}>
              {t(destination.labelKey)}
            </MenuItem>
          ))}
          {spFarm !== undefined && onToggleSpFarm && (
            <MenuItem onSelect={onToggleSpFarm}>
              {t(spFarm ? 'characters.unmarkSpFarmMenuLabel' : 'characters.markSpFarmMenuLabel')}
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem className="text-danger" onSelect={() => setTimeout(onRemove, 0)}>
            {t('characters.removeMenuLabel', { name })}
          </MenuItem>
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}
