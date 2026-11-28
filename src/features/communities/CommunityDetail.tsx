import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  EmptyState,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Modal,
  Panel,
  SlideOver,
  Spinner,
  TabPanel,
  Tabs,
  Toast,
  useOpenAfterMenu,
  useTabsId,
  CachedNotice,
  NeedsConnection,
} from '@/components/ui';
import { Expanded } from '@/components/ui/icons';
import { NOTICE_MS } from '@/components/ui/useTimedToast';
import { writeToClipboard } from '@/lib/clipboard';
import { useIsPhone } from '@/lib/useIsPhone';
import { uidForCharacter } from '@/sync/uid';
import { useOnline, useReconnectCount } from '@/stores/network';
import { deleteCommunitySnapshot, loadWithSnapshot } from './communityCache';
import { CommunityHeader } from './CommunityHeader';
import { CommunityLibrary } from './CommunityLibrary';
import { CommunitySharedFittings } from './CommunitySharedFittings';
import { CommunitySharedPlans } from './CommunitySharedPlans';
import { isOpenRequest } from '@/engine/communities/requests';
import { isContentTab, type CommunityTab, type ContentTab } from './communityTabs';
import { RequestsTab } from './RequestsTab';
import { FleetPayoutsTab } from './FleetPayoutsTab';
import { useFleetPayouts } from './useFleetPayouts';
import { fleetPayoutProgress, isExpired } from '@/engine/communities/fleetPayouts';
import { markRequestsSeen, watchRequestsViewed } from './requestBadge';
import { useCommunityRequests } from './useCommunityRequests';
import { CommunityMemberList } from './CommunityMemberList';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CommunityInvites } from './CommunityInvites';
import { CommunityPopSharers } from './CommunityPopSharers';
import { JoinRequestsList } from './JoinRequestsList';
import { ShareFittingsTab } from './ShareFittingsTab';
import { ShareSkillPlansTab } from './ShareSkillPlansTab';
import { ShareBlueprintsTab } from './ShareBlueprintsTab';
import { SharingLine } from './SharingLine';
import { useTabSharing } from './useTabSharing';
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

type ManagePanel = 'invites' | 'transfer';

export function CommunityDetail({
  community,
  characterId,
  onChanged,
  onPatch,
  onGone,
  initialTab = 'blueprints',
  initialSharing = false,
  initialPanel,
  initialRequestId,
}: {
  community: CommunitySummary;
  characterId: number;
  onChanged: () => void;
  onPatch: (patch: Partial<CommunitySummary>) => void;
  onGone: () => void;
  initialTab?: CommunityTab;
  initialSharing?: boolean;
  initialPanel?: ManagePanel;
  initialRequestId?: string;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const admin = isCommunityAdmin(community, characterId);
  const myUid = uidForCharacter(characterId);
  const [now] = useState(() => Date.now());
  const [members, setMembers] = useState<CommunityMember[] | null>(null);
  const [membersFailed, setMembersFailed] = useState(false);
  const [membersCached, setMembersCached] = useState(false);
  const online = useOnline();
  const reconnects = useReconnectCount();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [panel, setPanel] = useState<ManagePanel | null>(initialPanel ?? null);
  const [copied, setCopied] = useState<string | null>(null);
  const tabsId = useTabsId();
  const [tab, setTab] = useState<CommunityTab>(initialTab);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [requestsOpened, setRequestsOpened] = useState(initialTab === 'requests');
  const board = useCommunityRequests(characterId, community.id, requestsOpened);
  const [payoutsOpened, setPayoutsOpened] = useState(initialTab === 'payouts');
  const fleet = useFleetPayouts(characterId, community.id, payoutsOpened);
  const myOpenPayouts = fleet.payouts?.filter(
    (p) => p.ownerUid === myUid && !fleetPayoutProgress(p).done && !isExpired(p, now)
  ).length;
  const openRequests = board.requests?.filter((r) => isOpenRequest(r, now)).length;
  const requestsShown = tab === 'requests' && board.requests !== null;
  const shownRequests = requestsShown ? board.requests : null;
  useEffect(() => {
    if (!requestsShown) return;
    const unwatch = watchRequestsViewed(community.id);
    return unwatch;
  }, [requestsShown, community.id]);
  useEffect(() => {
    if (shownRequests === null) return;
    markRequestsSeen(characterId, community.id).catch((err) =>
      console.warn('Requests could not be marked seen', err)
    );
  }, [shownRequests, characterId, community.id]);
  const manageMenu = useOpenAfterMenu();

  const [sharingOpen, setSharingOpen] = useState(initialSharing && isContentTab(initialTab));
  const [contentKey, setContentKey] = useState(0);
  const { sharing, onFittingsMine, onPlansMine } = useTabSharing(
    characterId,
    community.id,
    contentKey
  );
  const closeSharing = () => {
    setSharingOpen(false);
    setContentKey((n) => n + 1);
  };

  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { value, cached } = await loadWithSnapshot({
          characterId,
          kind: 'members',
          communityId: community.id,
          live: () => loadCommunityMembers(characterId, community.id),
        });
        if (cancelled) return;
        setMembers(value);
        setMembersFailed(false);
        setMembersCached(cached);
      } catch {
        if (!cancelled) setMembersFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, community.id, community.memberCount, reload, reconnects]);

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
  const memberNames = new Map((members ?? []).map((m) => [m.uid, m.characterName]));
  const others = (members ?? []).filter((member) => member.uid !== community.adminUid);
  const invitesBody = useRef<HTMLDivElement>(null);
  const inviteFocus = () =>
    invitesBody.current?.querySelector<HTMLElement>('[data-invite-focus]') ?? null;
  const shownPanel = admin ? panel : null;
  const waiting = admin ? requests.length : 0;

  const ids = { characterId, communityId: community.id };
  const tabLabels: Record<ContentTab, string> = {
    blueprints: t('communities.tabs.blueprints'),
    fittings: t('communities.tabs.fittings'),
    plans: t('communities.tabs.plans'),
  };
  const everyoneViews: Record<ContentTab, () => ReactNode> = {
    blueprints: () => (
      <CommunityLibrary {...ids} members={members} membersFailed={membersFailed} now={now} />
    ),
    fittings: () => (
      <CommunitySharedFittings {...ids} members={members} onMineCount={onFittingsMine} />
    ),
    plans: () => <CommunitySharedPlans {...ids} members={members} onMineCount={onPlansMine} />,
  };
  const mineViews: Record<ContentTab, () => ReactNode> = {
    blueprints: () => <ShareBlueprintsTab {...ids} />,
    fittings: () => <ShareFittingsTab {...ids} />,
    plans: () => <ShareSkillPlansTab {...ids} />,
  };

  return (
    <div className="space-y-3">
      <CommunityHeader
        community={community}
        admin={admin}
        members={members}
        actions={
          admin &&
          (!online ? (
            <NeedsConnection>
              <Button size="sm">{t('communities.manage.trigger')}</Button>
            </NeedsConnection>
          ) : (
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
          ))
        }
      />
      <div>
        <Tabs
          tabsId={tabsId}
          tabs={[
            { id: 'blueprints', label: tabLabels.blueprints },
            { id: 'fittings', label: tabLabels.fittings },
            { id: 'plans', label: tabLabels.plans },
            {
              id: 'requests',
              label: t('communities.tabs.requests'),
              count: openRequests,
            },
            {
              id: 'payouts',
              label: t('communities.tabs.payouts'),
              count: myOpenPayouts || undefined,
            },
            {
              id: 'members',
              label: t('communities.members'),
              count: members?.length ?? community.memberCount,
            },
          ]}
          value={tab}
          onChange={(id) => {
            const next = id as CommunityTab;
            if (!isContentTab(next) && sharingOpen) closeSharing();
            if (next === 'requests') setRequestsOpened(true);
            if (next === 'payouts') setPayoutsOpened(true);
            setTab(next);
          }}
          label={t('communities.tabs.label')}
          className="mb-3"
        />
        <TabPanel tabsId={tabsId} tabId={tab}>
          {isContentTab(tab) ? (
            <div className="space-y-3">
              <SharingLine
                sharing={sharing[tab]}
                open={sharingOpen}
                onOpen={() => setSharingOpen(true)}
              />
              <Panel key={contentKey}>{everyoneViews[tab]()}</Panel>
            </div>
          ) : tab === 'requests' ? (
            <RequestsTab
              initialRequestId={initialRequestId}
              characterId={characterId}
              communityId={community.id}
              communityName={community.name}
              myUid={myUid}
              isAdmin={admin}
              memberNames={memberNames}
              requests={board.requests}
              pledges={board.pledges}
              pledgesFailed={board.pledgesFailed}
              failed={board.failed}
              now={now}
              onReload={board.reload}
              refreshPledges={board.refreshPledges}
            />
          ) : tab === 'payouts' ? (
            <FleetPayoutsTab
              characterId={characterId}
              communityId={community.id}
              myUid={myUid}
              members={members}
              payouts={fleet.payouts}
              failed={fleet.failed}
              now={now}
              onReload={fleet.reload}
            />
          ) : (
            <Panel>
              {membersCached && <CachedNotice className="mb-2" fetchedAt={null} />}
              {membersFailed ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p role="alert" className="min-w-0 flex-1 text-xs text-danger">
                    {t('communities.membersLoadFailed')}
                  </p>
                  <Button size="sm" onClick={() => setReload((n) => n + 1)}>
                    {t('communities.retry')}
                  </Button>
                </div>
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
            </Panel>
          )}
        </TabPanel>
      </div>

      <SlideOver
        open={sharingOpen && isContentTab(tab)}
        onClose={closeSharing}
        title={t('communities.sharing.title')}
        subtitle={
          isContentTab(tab)
            ? t('communities.sharing.subtitle', { tab: tabLabels[tab], community: community.name })
            : undefined
        }
      >
        {isContentTab(tab) && mineViews[tab]()}
      </SlideOver>

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
        <div ref={invitesBody}>
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
          <CommunityPopSharers communityId={community.id} characterId={characterId} />
        </div>
        {copied && (
          <Toast message={copied} durationMs={NOTICE_MS} onClose={() => setCopied(null)} />
        )}
      </Modal>
      <Modal
        open={shownPanel === 'transfer'}
        onClose={() => setPanel(null)}
        title={t('communities.manage.transferTitle')}
        placement={isPhone ? 'sheet-full' : 'center'}
      >
        <div className="space-y-2">
          <p className="text-xs text-text-dim">{t('communities.manage.transferHint')}</p>
          {membersFailed ? (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="min-w-0 flex-1 text-xs text-danger">
                {t('communities.membersLoadFailed')}
              </p>
              <Button size="sm" onClick={() => setReload((n) => n + 1)}>
                {t('communities.retry')}
              </Button>
            </div>
          ) : members === null ? (
            <Spinner size="sm" label={t('communities.loading')} />
          ) : others.length === 0 ? (
            <EmptyState
              title={t('communities.manage.transferNobody')}
              hint={t('communities.manage.transferNobodyHint')}
            />
          ) : (
            <ul className="divide-y divide-line">
              {others.map((member) => (
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
        returnFocusFallback={inviteFocus}
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
        returnFocusFallback={inviteFocus}
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
          await deleteCommunitySnapshot(characterId, community.id);
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
          await deleteCommunitySnapshot(characterId, community.id);
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
    </div>
  );
}
