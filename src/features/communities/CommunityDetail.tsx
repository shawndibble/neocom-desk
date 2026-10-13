import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Modal,
  Panel,
  SegmentedControl,
  Spinner,
  TabPanel,
  Tabs,
  Toast,
  useOpenAfterMenu,
  useTabsId,
  useTimedToast,
} from '@/components/ui';
import { Expanded } from '@/components/ui/icons';
import { NOTICE_MS } from '@/components/ui/useTimedToast';
import { writeToClipboard } from '@/lib/clipboard';
import { useIsPhone } from '@/lib/useIsPhone';
import { uidForCharacter } from '@/sync/uid';
import { CommunityLibrary } from './CommunityLibrary';
import { CommunitySharedFittings } from './CommunitySharedFittings';
import { CommunitySharedPlans } from './CommunitySharedPlans';
import type { CommunityTab } from './communityTabs';
import { CommunityMemberList } from './CommunityMemberList';
import { ConfirmDialog } from './ConfirmDialog';
import { CommunityInvites } from './CommunityInvites';
import { useContentScopes, type ContentScope, type ContentTab } from './contentScope';
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

/** The admin's Manage windows. */
type ManagePanel = 'invites' | 'transfer';

const isContentTab = (tab: CommunityTab): tab is ContentTab => tab !== 'members';

/**
 * One Community, as the open Character sees it (scope decision
 * `20261012-224358-communities-page-leads-with-shared-content`): what its Members
 * share comes first. Blueprints, Fittings and Skill plans each open on
 * Everyone (the Community's content) with Mine (what this Character shares,
 * and Add) one segment away; the pick per tab is remembered on this device.
 * Members is the roster. The admin's chores sit in the header's Manage menu:
 * Invites (join requests, approval, the link, mail invites), Transfer admin
 * and Delete. Any other Member leaves from the foot of the Members tab. Every
 * change refetches through `onChanged`, since Firestore here has no listeners.
 */
export function CommunityDetail({
  community,
  characterId,
  onChanged,
  onPatch,
  onGone,
  initialTab = 'blueprints',
  initialScope,
  initialPanel,
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
  /** Everyone or Mine for the opening tab (`?view=`), over the remembered pick. */
  initialScope?: ContentScope;
  /** A Manage window to open on (`?tab=invites`, the old Invites tab's link). */
  initialPanel?: ManagePanel;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const admin = isCommunityAdmin(community, characterId);
  const myUid = uidForCharacter(characterId);
  // Read once per mount: "as of" ages and the 30-day stale line need no ticking.
  const [now] = useState(() => Date.now());
  const [members, setMembers] = useState<CommunityMember[] | null>(null);
  const [membersFailed, setMembersFailed] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [panel, setPanel] = useState<ManagePanel | null>(initialPanel ?? null);
  const [copied, setCopied] = useState<string | null>(null);
  const tabsId = useTabsId();
  const [tab, setTab] = useState<CommunityTab>(initialTab);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const manageMenu = useOpenAfterMenu();
  useTimedToast(copied, () => setCopied(null), NOTICE_MS);

  const scopes = useContentScopes((s) => s.value);
  const scopesHydrated = useContentScopes((s) => s.hydrated);
  const setScopes = useContentScopes((s) => s.setValue);
  const hydrateScopes = useContentScopes((s) => s.hydrate);
  useEffect(() => {
    void hydrateScopes();
  }, [hydrateScopes]);
  // A `?view=` link wins on the tab it opened, until the pilot picks again.
  const [linkScope, setLinkScope] = useState(
    initialScope && isContentTab(initialTab) ? { tab: initialTab, scope: initialScope } : null
  );
  const scopeOf = (content: ContentTab): ContentScope =>
    linkScope?.tab === content ? linkScope.scope : scopes[content];

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
  // Manage is the admin's; if the role moves away, its windows close with it.
  const shownPanel = admin ? panel : null;
  const waiting = admin ? requests.length : 0;

  function contentView(content: ContentTab, scope: ContentScope) {
    if (scope === 'everyone') {
      if (content === 'blueprints') {
        return (
          <CommunityLibrary
            communityId={community.id}
            characterId={characterId}
            members={members}
            membersFailed={membersFailed}
            now={now}
          />
        );
      }
      const Everyone = content === 'fittings' ? CommunitySharedFittings : CommunitySharedPlans;
      return <Everyone characterId={characterId} communityId={community.id} members={members} />;
    }
    if (content === 'blueprints') {
      return <ShareBlueprintsTab characterId={characterId} communityId={community.id} />;
    }
    const Mine = content === 'fittings' ? ShareFittingsTab : ShareSkillPlansTab;
    return <Mine characterId={characterId} communityId={community.id} />;
  }

  return (
    <Panel
      title={community.name}
      meta={t('communities.memberCount', { count: community.memberCount })}
      actions={
        admin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                {waiting > 0
                  ? t('communities.manage.triggerWaiting', { count: waiting })
                  : t('communities.manage.trigger')}
                <Expanded aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-56"
              onCloseAutoFocus={manageMenu.onCloseAutoFocus}
            >
              <DropdownMenuItem onSelect={() => manageMenu.run(() => setPanel('invites'))}>
                {waiting > 0
                  ? t('communities.manage.invitesWaiting', { count: waiting })
                  : t('communities.manage.invites')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => manageMenu.run(() => setPanel('transfer'))}>
                {t('communities.manage.transfer')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-danger"
                onSelect={() => manageMenu.run(() => setDialog({ kind: 'delete' }))}
              >
                {t('communities.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    >
      <Tabs
        tabsId={tabsId}
        tabs={[
          { id: 'blueprints', label: t('communities.tabs.blueprints') },
          { id: 'fittings', label: t('communities.tabs.fittings') },
          { id: 'plans', label: t('communities.tabs.plans') },
          { id: 'members', label: t('communities.members') },
        ]}
        value={tab}
        onChange={(id) => setTab(id as CommunityTab)}
        label={t('communities.tabs.label')}
        className="mb-2"
      />
      <TabPanel tabsId={tabsId} tabId={tab}>
        {isContentTab(tab) ? (
          <div className="space-y-3">
            <SegmentedControl
              label={t('communities.scope.label')}
              value={scopeOf(tab)}
              onChange={(scope) => {
                setLinkScope(null);
                void setScopes({ ...scopes, [tab]: scope });
              }}
              options={[
                { value: 'everyone', label: t('communities.scope.everyone') },
                { value: 'mine', label: t('communities.scope.mine') },
              ]}
            />
            {/* Wait for the remembered pick, so a Mine pilot never loads Everyone first. */}
            {scopesHydrated || linkScope?.tab === tab ? (
              contentView(tab, scopeOf(tab))
            ) : (
              <Spinner size="sm" label={t('communities.loading')} />
            )}
          </div>
        ) : membersFailed ? (
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
            onLeave={() => setDialog({ kind: 'leave' })}
          />
        )}
      </TabPanel>

      <Modal
        open={shownPanel === 'invites'}
        onClose={() => setPanel(null)}
        title={t('communities.manage.invitesTitle')}
        placement={isPhone ? 'sheet-full' : 'center'}
      >
        <JoinRequestsList
          requests={requests}
          characterId={characterId}
          communityId={community.id}
          onDecided={() => {
            setRequestsReload((n) => n + 1);
            changed();
          }}
        />
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
        {/* Inside the window that raised it: the page behind is inert while it is open. */}
        {copied && <Toast message={copied} onClose={() => setCopied(null)} />}
      </Modal>
      <Modal
        open={shownPanel === 'transfer'}
        onClose={() => setPanel(null)}
        title={t('communities.manage.transferTitle')}
        placement={isPhone ? 'sheet-full' : 'center'}
      >
        <div className="space-y-2">
          <p className="text-xs text-text-dim">{t('communities.manage.transferHint')}</p>
          {members === null ? (
            <Spinner size="sm" label={t('communities.loading')} />
          ) : (
            <ul className="divide-y divide-line">
              {members
                .filter((member) => member.uid !== community.adminUid)
                .map((member) => (
                  <li key={member.uid} className="flex items-center gap-2 py-1 text-xs">
                    <span className="min-w-0 flex-1 truncate">{member.characterName}</span>
                    <Button
                      size="sm"
                      onClick={() => {
                        setPanel(null);
                        setDialog({ kind: 'makeAdmin', member });
                      }}
                    >
                      {t('communities.makeAdminAction')}
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </Modal>

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
    </Panel>
  );
}
