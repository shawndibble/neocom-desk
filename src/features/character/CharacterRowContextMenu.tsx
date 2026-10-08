/**
 * Right-click menu on a Characters-table row: jump straight to this
 * character's Overview, Skill training, Industry, PI, or Alerts, without
 * first clicking through to Overview and navigating from there. Every
 * destination reads the single active-character store (none of these routes
 * take a `:characterId` param — see `Overview.tsx`, `Skills.tsx`,
 * `Industry.tsx`), so getting there for a character other than the active
 * one means switching first, same as `Characters.tsx`'s own `select()`.
 */
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MenuItem, MenuSeparator, RowActionsMenu } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';

export interface CharacterRowContextMenuProps {
  characterId: number;
  /** The character's name, for the row's "More actions" button label. */
  name: string;
  /** Opens the remove-confirm dialog: the menu's one danger item (decision 20261005-202754). */
  onRemove: () => void;
  /** The `<tr>` `DataTable`'s `rowContextMenu` hands back — the menu's trigger. */
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
          <MenuSeparator />
          <MenuItem className="text-danger" onSelect={onRemove}>
            {t('characters.removeMenuLabel', { name })}
          </MenuItem>
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}
