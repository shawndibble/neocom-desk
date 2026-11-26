import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { MenuItem, RowActionsMenu } from '@/components/ui';
import { ExternalMark } from '@/components/ui/ExternalLink';
import { OpenInEveMenuItem } from '@/features/openInEve/OpenInEveMenuItem';
import { writeToClipboard } from '@/lib/clipboard';
import { entityInfoHref, parseEntityInfo, type EntityInfoTarget } from '@/lib/entityInfo';
import { characterZkillUrl } from '@/lib/zkillboard';

export function EntityShowInfoMenuItem({ entity }: { entity: EntityInfoTarget }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <MenuItem
      onSelect={() => {
        const drillDown = parseEntityInfo(location.search) !== null;
        navigate(entityInfoHref(location, entity), {
          replace: drillDown,
          state: drillDown ? location.state : undefined,
        });
      }}
    >
      {t('market.contextMenu.showInfo')}
    </MenuItem>
  );
}

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

export function CharacterMenuItems({
  characterId,
  name,
}: {
  characterId: number;
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

export function CharacterRowMenu({
  characterId,
  name,
  extraItems,
  children,
}: {
  characterId: number;
  name: string | null;
  extraItems?: ReactNode;
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
