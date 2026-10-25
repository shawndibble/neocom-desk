import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MenuItem,
  MenuSeparator,
  RowActionsMenu,
  RowMoreActions,
  SearchInput,
  NeedsConnection,
  Button,
} from '@/components/ui';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { isLibraryStale } from '@/engine/communities/sharedLibrary';
import { formatAge } from '@/lib/age';
import { characterIdForUid } from '@/sync/uid';
import { useOnline } from '@/stores/network';
import { communityBadgeClassName } from './communityBadge';
import type { CommunityMember } from './communityStore';

/** Above this many Members a name filter earns its row; a short roster is read at a glance. */
const FILTER_FROM = 8;

/**
 * The Members tab's roster: a portrait, the name and when their library was
 * last refreshed, an Admin or Stale badge, and, for the admin, a ⋮ on every
 * other Member (make admin, remove). Any other Member's Leave closes the tab,
 * set apart from the roster so it is never beside a row; the admin's Delete
 * is in the header's Manage menu.
 */
export function CommunityMemberList({
  members,
  adminUid,
  myUid,
  isAdmin,
  now,
  onMakeAdmin,
  onRemove,
  onLeave,
}: {
  members: readonly CommunityMember[];
  adminUid: string;
  myUid: string;
  isAdmin: boolean;
  now: number;
  onMakeAdmin: (member: CommunityMember) => void;
  onRemove: (member: CommunityMember) => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? members.filter((member) => member.characterName.toLowerCase().includes(needle))
    : members;

  return (
    <div className="space-y-3">
      {members.length > FILTER_FROM && (
        <SearchInput
          className="w-full"
          value={query}
          placeholder={t('communities.memberSearch')}
          aria-label={t('communities.memberSearch')}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      {shown.length === 0 ? (
        <p className="text-xs text-text-dim">{t('communities.noMemberMatch')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((member) => {
            const isSelf = member.uid === myUid;
            const isAdminRow = member.uid === adminUid;
            const stale = isLibraryStale(member.libraryAsOf, now);
            const characterId = characterIdForUid(member.uid);
            const row = (
              <li
                key={member.uid}
                className={`flex min-h-9 items-center gap-2.5 py-1.5 text-xs ${stale ? 'opacity-60' : ''}`}
              >
                {characterId !== null && (
                  <CharacterAvatar characterId={characterId} loading="lazy" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {member.characterName}
                    {isSelf && <span className="ml-1 text-text-dim">({t('communities.you')})</span>}
                  </span>
                  {member.libraryAsOf !== null && (
                    <span className="block truncate text-text-dim">
                      {t('communities.asOf', { age: formatAge(now - member.libraryAsOf, t) })}
                    </span>
                  )}
                </span>
                {stale && (
                  <span className={communityBadgeClassName}>{t('communities.staleBadge')}</span>
                )}
                {isAdminRow && (
                  <span className={communityBadgeClassName}>{t('communities.adminBadge')}</span>
                )}
                {isAdmin && !isAdminRow && online && <RowMoreActions />}
              </li>
            );
            // Only the admin has actions, and only on another Member: a row
            // with nothing to offer gets no ⋮ and no menu.
            // Offline the member actions would only fail: the row stays, without its ⋮.
            return isAdmin && !isAdminRow && online ? (
              <RowActionsMenu
                key={member.uid}
                name={member.characterName}
                items={
                  <>
                    <MenuItem onSelect={() => onMakeAdmin(member)}>
                      {t('communities.makeAdminMenu', { name: member.characterName })}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem className="text-danger" onSelect={() => onRemove(member)}>
                      {t('communities.removeMenu', { name: member.characterName })}
                    </MenuItem>
                  </>
                }
              >
                {row}
              </RowActionsMenu>
            ) : (
              row
            );
          })}
        </ul>
      )}

      {!isAdmin && (
        <section className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
          <p className="min-w-0 flex-1 basis-48 text-xs text-text-dim">
            {t('communities.leaveHint')}
          </p>
          <NeedsConnection>
            <Button variant="danger" size="sm" onClick={onLeave}>
              {t('communities.leave')}
            </Button>
          </NeedsConnection>
        </section>
      )}
    </div>
  );
}
