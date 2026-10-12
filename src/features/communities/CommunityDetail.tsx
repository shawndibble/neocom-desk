import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  MenuItem,
  MenuSeparator,
  Panel,
  RowActionsMenu,
  RowMoreActions,
  Spinner,
  Toast,
  useTimedToast,
} from '@/components/ui';
import { NOTICE_MS } from '@/components/ui/useTimedToast';
import { isLibraryStale } from '@/engine/communities/sharedLibrary';
import { formatAge } from '@/lib/age';
import { writeToClipboard } from '@/lib/clipboard';
import { uidForCharacter } from '@/sync/uid';
import { ConfirmDialog } from './ConfirmDialog';
import { MailInvitePanel } from './MailInvitePanel';
import { ShareFittingsPanel } from './ShareFittingsPanel';
import { ShareSelectionDialog } from './ShareSelectionDialog';
import { loadShareSelection } from './shareSelection';
import {
  communityInviteUrl,
  deleteCommunity,
  isCommunityAdmin,
  leaveCommunity,
  loadCommunityMembers,
  regenerateInvite,
  removeMember,
  revokeInvite,
  transferAdmin,
  type CommunityMember,
  type CommunitySummary,
} from './communityStore';

type Dialog =
  | { kind: 'regenerate' | 'revoke' | 'leave' | 'delete' }
  | { kind: 'remove' | 'makeAdmin'; member: CommunityMember };

/**
 * One Community, as the open Character sees it. The admin gets the invite link
 * (copy, regenerate, revoke), a ⋮ on every other Member (make admin, remove)
 * and Delete; any other Member gets Leave. Every change refetches through
 * `onChanged`, since Firestore here has no listeners.
 */
export function CommunityDetail({
  community,
  characterId,
  onChanged,
  onPatch,
  onGone,
}: {
  community: CommunitySummary;
  characterId: number;
  /** Refetch the list in the background. */
  onChanged: () => void;
  /** Apply a known result at once, so the view never waits on the refetch to stop offering admin controls. */
  onPatch: (patch: Partial<CommunitySummary>) => void;
  /** The Community no longer lists this Character (left, or deleted). */
  onGone: () => void;
}) {
  const { t } = useTranslation();
  const admin = isCommunityAdmin(community, characterId);
  const myUid = uidForCharacter(characterId);
  // Read once per mount: "as of" ages and the 30-day stale line need no ticking.
  const [now] = useState(() => Date.now());
  const [members, setMembers] = useState<CommunityMember[] | null>(null);
  const [membersFailed, setMembersFailed] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [sharedCount, setSharedCount] = useState<number | null>(null);
  useTimedToast(copied, () => setCopied(null), NOTICE_MS);

  useEffect(() => {
    let cancelled = false;
    void loadShareSelection(characterId, community.id).then((saved) => {
      if (!cancelled) setSharedCount(saved.size);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, community.id]);

  // Bumped after a change that alters the Member list, to refetch it.
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadCommunityMembers(characterId, community.id);
        if (cancelled) return;
        setMembers(loaded);
        setMembersFailed(false);
      } catch {
        if (!cancelled) setMembersFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, community.id, community.memberCount, reload]);

  const myName = members?.find((member) => member.uid === myUid)?.characterName ?? '';
  const inviteUrl = community.inviteCode ? communityInviteUrl(community.inviteCode) : null;
  const close = () => setDialog(null);
  const changed = () => {
    setReload((n) => n + 1);
    onChanged();
  };

  return (
    <Panel
      title={community.name}
      meta={t('communities.memberCount', { count: community.memberCount })}
      actions={
        admin ? (
          <Button variant="danger" size="sm" onClick={() => setDialog({ kind: 'delete' })}>
            {t('communities.delete')}
          </Button>
        ) : (
          <Button variant="danger" size="sm" onClick={() => setDialog({ kind: 'leave' })}>
            {t('communities.leave')}
          </Button>
        )
      }
    >
      {admin && (
        <>
          <section className="mb-4 space-y-2" aria-label={t('communities.invite')}>
            <h3 className="text-xs font-semibold">{t('communities.invite')}</h3>
            {inviteUrl ? (
              <>
                <p className="text-xs text-text-dim">{t('communities.inviteHint')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1 text-xs">
                    {inviteUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      void writeToClipboard(inviteUrl).then(
                        () => setCopied(t('communities.copied')),
                        () => setCopied(t('communities.copyFailed'))
                      )
                    }
                  >
                    {t('communities.copyLink')}
                  </Button>
                  <Button size="sm" onClick={() => setDialog({ kind: 'regenerate' })}>
                    {t('communities.regenerate')}
                  </Button>
                  <Button size="sm" onClick={() => setDialog({ kind: 'revoke' })}>
                    {t('communities.revoke')}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-text-dim">{t('communities.inviteOff')}</p>
                <Button size="sm" onClick={() => setDialog({ kind: 'regenerate' })}>
                  {t('communities.regenerate')}
                </Button>
              </div>
            )}
          </section>
          {inviteUrl && <MailInvitePanel community={community} characterId={characterId} />}
        </>
      )}

      <section
        className="mb-4 flex flex-wrap items-center gap-2"
        aria-label={t('communities.share.legend')}
      >
        <p className="text-xs text-text-dim">
          {sharedCount !== null &&
            myName !== '' &&
            t('communities.share.summary', { count: sharedCount, name: myName })}
        </p>
        <Button size="sm" onClick={() => setSharing(true)}>
          {t('communities.share.choose')}
        </Button>
      </section>

      <ShareFittingsPanel characterId={characterId} communityId={community.id} />

      <h3 className="mb-1 text-xs font-semibold">{t('communities.members')}</h3>
      {membersFailed ? (
        <p role="alert" className="text-xs text-danger">
          {t('communities.membersLoadFailed')}
        </p>
      ) : members === null ? (
        <Spinner size="sm" label={t('communities.loading')} />
      ) : (
        <ul className="divide-y divide-line">
          {members.map((member) => {
            const isSelf = member.uid === myUid;
            const isAdminRow = member.uid === community.adminUid;
            const stale = isLibraryStale(member.libraryAsOf, now);
            const row = (
              <li
                key={member.uid}
                className={`flex items-center gap-2 py-1.5 text-xs ${stale ? 'opacity-60' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {member.characterName}
                  {isSelf && <span className="ml-1 text-text-dim">({t('communities.you')})</span>}
                  {member.libraryAsOf !== null && (
                    <span className="ml-1 text-text-dim">
                      {t('communities.asOf', { age: formatAge(now - member.libraryAsOf, t) })}
                    </span>
                  )}
                </span>
                {stale && (
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] text-text-dim">
                    {t('communities.staleBadge')}
                  </span>
                )}
                {isAdminRow && (
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] text-text-dim">
                    {t('communities.adminBadge')}
                  </span>
                )}
                {admin && !isAdminRow && <RowMoreActions />}
              </li>
            );
            // Only the admin has actions, and only on another Member: a row
            // with nothing to offer gets no ⋮ and no menu.
            return admin && !isAdminRow ? (
              <RowActionsMenu
                key={member.uid}
                name={member.characterName}
                items={
                  <>
                    <MenuItem onSelect={() => setDialog({ kind: 'makeAdmin', member })}>
                      {t('communities.makeAdminMenu', { name: member.characterName })}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      className="text-danger"
                      onSelect={() => setDialog({ kind: 'remove', member })}
                    >
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

      <ConfirmDialog
        open={dialog?.kind === 'regenerate'}
        title={t('communities.regenerateTitle')}
        body={t('communities.regenerateBody')}
        actionLabel={t('communities.regenerateAction')}
        danger={false}
        onClose={close}
        onConfirm={async () => {
          const { inviteCode } = await regenerateInvite(characterId, community.id);
          onPatch({ inviteCode });
          onChanged();
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'revoke'}
        title={t('communities.revokeTitle')}
        body={t('communities.revokeBody')}
        actionLabel={t('communities.revokeAction')}
        onClose={close}
        onConfirm={async () => {
          await revokeInvite(characterId, community.id);
          onPatch({ inviteCode: null });
          onChanged();
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'leave'}
        title={t('communities.leaveTitle', { name: community.name })}
        body={t('communities.leaveBody')}
        actionLabel={t('communities.leaveAction')}
        onClose={close}
        onConfirm={async () => {
          await leaveCommunity(characterId, community.id);
          onGone();
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title={t('communities.deleteTitle', { name: community.name })}
        body={t('communities.deleteBody')}
        actionLabel={t('communities.deleteAction')}
        onClose={close}
        onConfirm={async () => {
          await deleteCommunity(characterId, community.id);
          onGone();
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'remove'}
        title={t('communities.removeTitle', {
          name: dialog?.kind === 'remove' ? dialog.member.characterName : '',
        })}
        body={t('communities.removeBody')}
        actionLabel={t('communities.removeAction')}
        onClose={close}
        onConfirm={async () => {
          if (dialog?.kind !== 'remove') return;
          await removeMember(characterId, community.id, dialog.member.uid);
          onPatch({ memberCount: Math.max(0, community.memberCount - 1) });
          changed();
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'makeAdmin'}
        title={t('communities.makeAdminTitle', {
          name: dialog?.kind === 'makeAdmin' ? dialog.member.characterName : '',
        })}
        body={t('communities.makeAdminBody')}
        actionLabel={t('communities.makeAdminAction')}
        danger={false}
        onClose={close}
        onConfirm={async () => {
          if (dialog?.kind !== 'makeAdmin') return;
          await transferAdmin(characterId, community.id, dialog.member.uid);
          onPatch({ adminUid: dialog.member.uid });
          onChanged();
        }}
      />
      <ShareSelectionDialog
        open={sharing}
        characterId={characterId}
        characterName={myName}
        communityId={community.id}
        onClose={() => setSharing(false)}
        onSaved={setSharedCount}
      />
      {copied && <Toast message={copied} onClose={() => setCopied(null)} />}
    </Panel>
  );
}
