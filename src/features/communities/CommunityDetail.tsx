import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Panel,
  Spinner,
  TabPanel,
  Tabs,
  Toast,
  useTabsId,
  useTimedToast,
} from '@/components/ui';
import { NOTICE_MS } from '@/components/ui/useTimedToast';
import { writeToClipboard } from '@/lib/clipboard';
import { uidForCharacter } from '@/sync/uid';
import { CommunityLibrary } from './CommunityLibrary';
import type { CommunityTab } from './communityTabs';
import { CommunityMemberList } from './CommunityMemberList';
import { ConfirmDialog } from './ConfirmDialog';
import { CommunityInvites } from './CommunityInvites';
import { JoinRequestsList } from './JoinRequestsList';
import { ShareFittingsTab } from './ShareFittingsTab';
import { ShareSkillPlansTab } from './ShareSkillPlansTab';
import { ShareBlueprintsTab } from './ShareBlueprintsTab';
import {
  deleteCommunity,
  isCommunityAdmin,
  leaveCommunity,
  loadCommunityMembers,
  loadJoinRequests,
  regenerateInvite,
  removeMember,
  revokeInvite,
  transferAdmin,
  type CommunityMember,
  type JoinRequest,
  type CommunitySummary,
} from './communityStore';

type Dialog =
  | { kind: 'regenerate' | 'revoke' | 'leave' | 'delete' }
  | { kind: 'remove' | 'makeAdmin'; member: CommunityMember };

/**
 * One Community, as the open Character sees it. The admin gets the invite link
 * (copy, regenerate, revoke), a ⋮ on every other Member (make admin, remove)
 * and Delete; any other Member gets Leave. Both sit at the foot of the Members tab. Every change refetches through
 * `onChanged`, since Firestore here has no listeners.
 */
export function CommunityDetail({
  community,
  characterId,
  onChanged,
  onPatch,
  onGone,
  initialTab = 'blueprints',
}: {
  community: CommunitySummary;
  characterId: number;
  /** Refetch the list in the background. */
  onChanged: () => void;
  /** Apply a known result at once, so the view never waits on the refetch to stop offering admin controls. */
  onPatch: (patch: Partial<CommunitySummary>) => void;
  /** The Community no longer lists this Character (left, or deleted). */
  onGone: () => void;
  /** The tab to open on (`?tab=`); Blueprints unless a link says otherwise. */
  initialTab?: CommunityTab;
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
  const tabsId = useTabsId();
  const [tab, setTab] = useState<CommunityTab | 'library'>(initialTab);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  // Admin-only tabs fall back to Blueprints if the admin role moved to someone else.
  const shownTab = tab === 'invites' && !admin ? 'blueprints' : tab;
  useTimedToast(copied, () => setCopied(null), NOTICE_MS);

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

  // The admin's waiting list. A failed read (a backend not yet updated) is an empty list.
  const [requestsReload, setRequestsReload] = useState(0);
  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    loadJoinRequests(characterId, community.id).then(
      (loaded) => {
        if (!cancelled) setRequests(loaded);
      },
      () => {
        if (!cancelled) setRequests([]);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [admin, characterId, community.id, requestsReload]);

  const close = () => setDialog(null);
  const changed = () => {
    setReload((n) => n + 1);
    onChanged();
  };

  return (
    <Panel
      title={community.name}
      meta={t('communities.memberCount', { count: community.memberCount })}
    >
      {tab === 'library' ? (
        <>
          <Button size="sm" className="mb-2" onClick={() => setTab('blueprints')}>
            {t('communities.library.back')}
          </Button>
          <CommunityLibrary
            communityId={community.id}
            characterId={characterId}
            members={members}
            membersFailed={membersFailed}
            now={now}
          />
        </>
      ) : (
        <>
          <Tabs
            tabsId={tabsId}
            tabs={[
              { id: 'blueprints', label: t('communities.tabs.blueprints') },
              { id: 'fittings', label: t('communities.tabs.fittings') },
              { id: 'plans', label: t('communities.tabs.plans') },
              {
                id: 'members',
                label:
                  admin && requests.length > 0
                    ? t('communities.requests.tab', { count: requests.length })
                    : t('communities.members'),
              },
              ...(admin ? [{ id: 'invites', label: t('communities.tabs.invites') }] : []),
            ]}
            value={shownTab}
            onChange={(id) => setTab(id as CommunityTab)}
            label={t('communities.tabs.label')}
            className="mb-2"
          />
          <TabPanel tabsId={tabsId} tabId={shownTab}>
            {shownTab === 'blueprints' ? (
              <ShareBlueprintsTab
                characterId={characterId}
                communityId={community.id}
                onOpenLibrary={() => setTab('library')}
              />
            ) : shownTab === 'fittings' ? (
              <ShareFittingsTab characterId={characterId} communityId={community.id} />
            ) : shownTab === 'plans' ? (
              <ShareSkillPlansTab characterId={characterId} communityId={community.id} />
            ) : shownTab === 'invites' ? (
              <CommunityInvites
                community={community}
                characterId={characterId}
                onCopy={(url) =>
                  void writeToClipboard(url).then(
                    () => setCopied(t('communities.copied')),
                    () => setCopied(t('communities.copyFailed'))
                  )
                }
                onRegenerate={() => setDialog({ kind: 'regenerate' })}
                onRevoke={() => setDialog({ kind: 'revoke' })}
                onPatch={onPatch}
              />
            ) : (
              <>
                {admin && (
                  <JoinRequestsList
                    requests={requests}
                    characterId={characterId}
                    communityId={community.id}
                    onDecided={() => {
                      setRequestsReload((n) => n + 1);
                      changed();
                    }}
                  />
                )}
                {membersFailed ? (
                  <p role="alert" className="text-xs text-danger">
                    {t('communities.membersLoadFailed')}
                  </p>
                ) : members === null ? (
                  <Spinner size="sm" label={t('communities.loading')} />
                ) : (
                  <CommunityMemberList
                    members={members}
                    adminUid={community.adminUid}
                    myUid={myUid}
                    isAdmin={admin}
                    now={now}
                    onMakeAdmin={(member) => setDialog({ kind: 'makeAdmin', member })}
                    onRemove={(member) => setDialog({ kind: 'remove', member })}
                    onLeaveOrDelete={() => setDialog({ kind: admin ? 'delete' : 'leave' })}
                  />
                )}
              </>
            )}
          </TabPanel>
        </>
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
      {copied && <Toast message={copied} onClose={() => setCopied(null)} />}
    </Panel>
  );
}
