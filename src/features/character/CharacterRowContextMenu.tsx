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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';

export interface CharacterRowContextMenuProps {
  characterId: number;
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

export function CharacterRowContextMenu({ characterId, children }: CharacterRowContextMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setActiveCharacter = useActiveCharacter((state) => state.setActiveCharacter);

  async function go(path: string) {
    await setActiveCharacter(characterId);
    navigate(path);
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {DESTINATIONS.map((destination) => (
          <ContextMenuItem key={destination.path} onSelect={() => void go(destination.path)}>
            {t(destination.labelKey)}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
