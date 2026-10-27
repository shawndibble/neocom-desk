import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CharacterAvatar } from '@/components/ui';
import { characterIdForUid } from '@/sync/uid';
import { communityBadgeClassName } from './communityBadge';
import { communityInitials } from './communityInitials';
import type { CommunityMember, CommunitySummary } from './communityStore';

/** Portraits in the stack; the names line says how many more there are. */
const PORTRAITS = 5;
/** Names spelled out before "and N more". */
const NAMED = 3;

/**
 * The open Community's card (scope decision
 * `20261013-072418-communities-my-sharing-slide-out-and-community-header`):
 * its initials, name and the Admin badge for its admin, the first Members'
 * portraits and names, and the header's actions (Manage) in the top-right
 * corner. How many Members there are rides on the Members tab, not here.
 */
export function CommunityHeader({
  community,
  admin,
  members,
  actions,
}: {
  community: CommunitySummary;
  /** This Character admins it. */
  admin: boolean;
  /** Null while the roster loads: the card shows the name alone. */
  members: readonly CommunityMember[] | null;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const roster = members ?? [];
  const names = roster.slice(0, NAMED).map((member) => member.characterName);
  const more = roster.length - names.length;
  const portraits = roster
    .slice(0, PORTRAITS)
    .map((member) => characterIdForUid(member.uid))
    .filter((id): id is number => id !== null);

  return (
    // Manage stays top-right on a phone too; the name wraps beside it.
    <div className="flex items-start gap-3 rounded-xs border border-line bg-panel p-3 md:p-4">
      {/* A grid, not a flex row: a stretched flex item doesn't derive its width from aspect-ratio, a grid item does. */}
      <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-3">
        <span
          aria-hidden="true"
          className="grid aspect-square min-h-10 place-items-center rounded-xs border border-accent-dim bg-panel-2 text-sm font-semibold text-accent"
        >
          {communityInitials(community.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="min-w-0 text-sm font-semibold break-words md:text-base">
              {community.name}
            </h2>
            {admin && (
              <span className={communityBadgeClassName}>{t('communities.adminBadge')}</span>
            )}
          </div>
          {names.length > 0 && (
            <div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-text-dim">
              {portraits.length > 0 && (
                <span className="flex shrink-0 -space-x-2">
                  {portraits.map((id) => (
                    <CharacterAvatar
                      key={id}
                      characterId={id}
                      size="sm"
                      className="ring-2 ring-panel"
                    />
                  ))}
                </span>
              )}
              <span className="min-w-0 truncate">
                {more > 0
                  ? t('communities.header.more', { names: names.join(', '), count: more })
                  : names.join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
