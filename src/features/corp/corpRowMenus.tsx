/**
 * Row-menu pieces shared by the corp tables (`/corp`, `/srp`): the entity
 * actions a row's player or pilot carries. Written with the kind-agnostic
 * `MenuItem`, so one list serves the right-click menu, touch-and-hold and the
 * row's ⋮ (DESIGN.md §6c). A table adds its own destinations around them.
 */
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { MenuItem, RowActionsMenu } from '@/components/ui';
import { ExternalMark } from '@/components/ui/ExternalLink';
import { ENTITY_INFO_PUSHED_STATE } from '@/features/entities/entityInfoState';
import { OpenInEveMenuItem } from '@/features/openInEve/OpenInEveMenuItem';
import { writeToClipboard } from '@/lib/clipboard';
import { entityInfoHref, parseEntityInfo, type EntityInfoTarget } from '@/lib/entityInfo';
import { characterZkillUrl } from '@/lib/zkillboard';

/** "Show info" for a character, corporation or alliance: the same URL its name link opens. */
export function EntityShowInfoMenuItem({ entity }: { entity: EntityInfoTarget }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <MenuItem
      onSelect={() => {
        // From inside an open modal the entry is replaced, not stacked (`InfoLink`).
        const drillDown = parseEntityInfo(location.search) !== null;
        navigate(entityInfoHref(location, entity), {
          replace: drillDown,
          state: drillDown ? location.state : ENTITY_INFO_PUSHED_STATE,
        });
      }}
    >
      {t('market.contextMenu.showInfo')}
    </MenuItem>
  );
}

/** A third-party page in a new tab, carrying the external mark like any other leaving link. */
export function ExternalMenuItem({ href, children }: { href: string; children: ReactNode }) {
  return (
    <MenuItem onSelect={() => window.open(href, '_blank', 'noopener,noreferrer')}>
      {children}
      <ExternalMark />
    </MenuItem>
  );
}

export function CopyMenuItem({ text, children }: { text: string; children: ReactNode }) {
  return <MenuItem onSelect={() => void writeToClipboard(text)}>{children}</MenuItem>;
}

/** The actions a player (character) carries: Show info, Open in EVE, zKillboard, Copy name. */
export function CharacterMenuItems({
  characterId,
  name,
}: {
  characterId: number;
  /** Null, or the `#<id>` placeholder, when the name never resolved: Copy name is then left out. */
  name: string | null;
}) {
  const { t } = useTranslation();
  return (
    <>
      <EntityShowInfoMenuItem entity={{ kind: 'character', id: characterId }} />
      <OpenInEveMenuItem kind="information" id={characterId} />
      <ExternalMenuItem href={characterZkillUrl(characterId)}>
        {t('publicInfo.zkillboard')}
      </ExternalMenuItem>
      {name && !name.startsWith('#') && (
        <CopyMenuItem text={name}>{t('market.contextMenu.copyName')}</CopyMenuItem>
      )}
    </>
  );
}

/**
 * Right-click / hold / ⋮ menu for a row about one player. `extraItems` are the
 * table's own actions, shown first.
 */
export function CharacterRowMenu({
  characterId,
  name,
  extraItems,
  children,
}: {
  characterId: number;
  name: string | null;
  extraItems?: ReactNode;
  /** The `<tr>` or card `DataTable`'s `rowContextMenu` hands back. */
  children: ReactElement;
}) {
  return (
    <RowActionsMenu
      name={name ?? `#${characterId}`}
      linksKeepBrowserMenu
      items={
        <>
          {extraItems}
          <CharacterMenuItems characterId={characterId} name={name} />
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}
