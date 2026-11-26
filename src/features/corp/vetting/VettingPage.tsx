import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  IconButton,
  LiveStatus,
  LoadFailedState,
  Modal,
  PageHeader,
  Panel,
  SegmentedControl,
  Spinner,
  Tabs,
  Tooltip,
  useTabPanelProps,
  useTabsId,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantNote } from '@/app/GrantNote';
import { SEND_MAIL_ENDPOINTS } from '@/esi/registry';
import { ActionResult } from '@/features/settings/settingsFields';
import { useCharacterNames } from '@/features/character/useCharacters';
import type { VettingReviewSummary } from '@/engine/vetting';
import { writeToClipboard } from '@/lib/clipboard';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { useIsPhone } from '@/lib/useIsPhone';
import { tabPath } from '@/lib/pageTabs';
import { usePageTab } from '@/lib/usePageTab';
import { ReviewMemberDialog } from './ReviewMemberDialog';
import { markMembers } from './reviewRoster';
import { useReviewRoster } from './useReviewRoster';
import { useVettingRequestMail } from './useVettingRequestMail';
import type { RequestMailRun } from './vettingRequestMail';
import { VettingQueue } from './VettingQueue';
import { clearVettingSession } from './vettingSession';
import { VettingRawData } from './VettingRawData';
import { VettingReport } from './VettingReport';
import { VettingInvitesDialog } from './VettingInvitesDialog';
import { VettingSettingsView } from './VettingSettingsView';
import { vettingBackend } from './vettingClient';
import {
  VETTING_TABS,
  dataFromPathname,
  reviewIdFromPathname,
  reviewPath,
  settingsSectionFromPathname,
  settingsSectionPath,
  type VettingTabId,
} from './vettingTabs';
import { applyLink, requestLink } from './vettingText';
import { isDecided, needsYours, visibleReviews } from './vettingView';
import { useVettingOverview } from './useVettingOverview';

export function VettingPage() {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const phone = useIsPhone();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [tab, selectTab] = usePageTab(VETTING_TABS);
  const { state, characterId, corporationId, reload, replace } = useVettingOverview();
  const { copied, flash } = useCopyFeedback<'copied' | 'failed'>(2000);
  const [requesting, setRequesting] = useState(false);
  const roster = useReviewRoster(requesting ? characterId : null, corporationId);
  const settingsFrom = useRef<'open' | 'decided'>('open');
  const [invitesOpen, setInvitesOpen] = useState<'new' | 'list' | null>(null);
  const [rowMail, setRowMail] = useState<{ name: string; run: RequestMailRun } | null>(null);
  const names = useCharacterNames();
  const requestMail = useVettingRequestMail(characterId ?? 0, corporationId ?? 0, replace);
  useEffect(() => clearVettingSession, [characterId, corporationId]);
  const reviewId = reviewIdFromPathname(pathname);
  const data = dataFromPathname(pathname);
  const canConfigure = state.status === 'ready' && state.overview.canConfigure;
  const shown: VettingTabId = tab === 'settings' ? 'open' : tab;
  const settingsOpen = tab === 'settings' && canConfigure;
  const panel = useTabPanelProps(phone ? null : tabsId, shown);

  if (data !== null && characterId !== null && corporationId !== null) {
    return (
      <VettingRawData
        characterId={characterId}
        corporationId={corporationId}
        reviewId={data.reviewId}
        tab={data.tab}
        source={data.source}
      />
    );
  }

  if (reviewId !== null && characterId !== null && corporationId !== null && tab !== 'settings') {
    return (
      <VettingReport
        characterId={characterId}
        corporationId={corporationId}
        reviewId={reviewId}
        tab={tab}
        settings={
          state.status === 'ready'
            ? state.overview.settings
            : state.status === 'loading'
              ? undefined
              : null
        }
        onDecided={reload}
      />
    );
  }

  const page = (body: React.ReactNode, actions?: React.ReactNode) => (
    <div className="mx-auto max-w-page space-y-4">
      <PageHeader title={t('vetting.title')} actions={actions} />
      {body}
    </div>
  );
  if (state.status === 'loading' || characterId === null || corporationId === null) {
    return page(<Spinner block="page" label={t('common.loading')} />);
  }
  if (state.status === 'failed') {
    return page(
      <Panel>
        <LoadFailedState onRetry={reload} />
      </Panel>
    );
  }
  if (state.status === 'denied') {
    return page(
      <Panel>
        <EmptyState title={t('vetting.deniedTitle')} hint={t('vetting.deniedHint')} />
      </Panel>
    );
  }

  const { overview } = state;
  const reviews = visibleReviews(overview.reviews, characterId);
  const open = reviews.filter((review) => !isDecided(review.state));
  const decided = reviews.filter((review) => isDecided(review.state));
  const yours = open.filter(needsYours).length;
  const on = overview.settings.on;
  const tabs: { id: VettingTabId; label: string; count?: number; countTone?: 'warning' }[] = [
    {
      id: 'open',
      label: t('vetting.tabs.open'),
      count: open.length,
      countTone: yours > 0 ? 'warning' : undefined,
    },
    { id: 'decided', label: t('vetting.tabs.decided') },
  ];

  const copy = async () => {
    try {
      await writeToClipboard(applyLink(corporationId));
      flash('copied');
    } catch {
      flash('failed');
    }
  };
  const mailRow = async (review: VettingReviewSummary) => {
    setRowMail({ name: review.pilot.name, run: await requestMail.send(review) });
  };
  const copyRequestLink = async () => {
    try {
      await writeToClipboard(requestLink());
      flash('copied');
    } catch {
      flash('failed');
    }
  };
  const { inviteOnly } = overview.settings;
  const copyButton = inviteOnly ? (
    <Button aria-disabled={!on || undefined} onClick={on ? () => setInvitesOpen('new') : undefined}>
      {t('vetting.newInvite')}
    </Button>
  ) : (
    <Button aria-disabled={!on || undefined} onClick={on ? () => void copy() : undefined}>
      {t(
        copied === 'failed' ? 'vetting.copyFailed' : copied ? 'vetting.copied' : 'vetting.copyLink'
      )}
    </Button>
  );

  const settingsGear = canConfigure ? (
    <IconButton
      icon={<Icon.Settings />}
      label={t('pageSettings.open', { page: t('vetting.title') })}
      onClick={() => {
        settingsFrom.current = shown === 'decided' ? 'decided' : 'open';
        navigate(settingsSectionPath(settingsSectionFromPathname(pathname)));
      }}
    />
  ) : undefined;

  return page(
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm tabular-nums" aria-live="polite">
          <span className="font-semibold">{t('vetting.summary.open', { count: open.length })}</span>
          <span className="text-text-dim"> · </span>
          <span className="font-semibold">{yours}</span>
          <span className="text-text-dim"> {t('vetting.summary.yours', { count: yours })}</span>
        </p>
        <span className="flex flex-wrap gap-2">
          {on ? copyButton : <Tooltip content={t('vetting.copyOff')}>{copyButton}</Tooltip>}
          <Button onClick={() => setInvitesOpen('list')}>{t('vetting.invites.open')}</Button>
          <Button onClick={() => setRequesting(true)}>{t('vetting.reviewMember')}</Button>
        </span>
        <LiveStatus>
          {copied === 'failed' ? t('vetting.copyFailed') : copied ? t('vetting.copied') : ''}
        </LiveStatus>
      </div>
      {!on && (
        <p className="text-sm text-text-dim">
          {t(canConfigure ? 'vetting.offNote.director' : 'vetting.offNote.reviewer')}
        </p>
      )}
      {phone ? (
        <SegmentedControl
          label={t('vetting.tabsLabel')}
          fill
          uppercase={false}
          value={shown}
          onChange={selectTab}
          options={tabs.map((entry) => ({
            value: entry.id,
            label:
              entry.count === undefined
                ? entry.label
                : t('vetting.tabWithCount', { label: entry.label, count: entry.count }),
          }))}
        />
      ) : (
        <Tabs
          tabsId={tabsId}
          label={t('vetting.tabsLabel')}
          value={shown}
          onChange={(id) => selectTab(id as VettingTabId)}
          tabs={tabs}
        />
      )}
      {rowMail && (
        <div className="space-y-2">
          {rowMail.run.unrecorded ? (
            <ActionResult kind="error">
              {t('vetting.requestRow.mailUnrecorded', { name: rowMail.name })}
            </ActionResult>
          ) : rowMail.run.cooldown ? (
            <ActionResult kind="info">{t('vetting.requestRow.mailCooldown')}</ActionResult>
          ) : rowMail.run.queued.length > 0 ? (
            <ActionResult kind="success">
              {t('vetting.requestRow.mailQueued', { name: rowMail.name })}
            </ActionResult>
          ) : rowMail.run.missingScope ? (
            <GrantNote
              characterId={characterId}
              endpoints={SEND_MAIL_ENDPOINTS}
              title={t('vetting.requestRow.grantTitle')}
            />
          ) : rowMail.run.failed.length > 0 ? (
            <ActionResult kind="error">
              {t('vetting.requestRow.mailFailed', { name: rowMail.name })}
            </ActionResult>
          ) : (
            <ActionResult kind="info">{t('vetting.requestRow.mailAlready')}</ActionResult>
          )}
        </div>
      )}
      <div {...panel}>
        <VettingQueue
          tab={shown}
          rows={shown === 'open' ? open : decided}
          onOpen={(review) => navigate(reviewPath(shown, review.id))}
          reviewerId={characterId}
          onRequestMail={(review) => void mailRow(review)}
          onCopyRequestLink={() => void copyRequestLink()}
        />
      </div>
      {settingsOpen && (
        <Modal
          open
          onClose={() => navigate(tabPath(VETTING_TABS, settingsFrom.current), { replace: true })}
          title={t('pageSettings.title', { page: t('vetting.title') })}
          placement="page"
          closeOnBack={false}
          dismissOnOutsidePress={false}
        >
          <VettingSettingsView
            characterId={characterId}
            settings={overview.settings}
            section={settingsSectionFromPathname(pathname)}
            invites={overview.invites.length}
            onManageInvites={() => setInvitesOpen('list')}
            onSave={async (patch) => {
              replace(await vettingBackend().saveSettings(characterId, corporationId, patch));
            }}
          />
        </Modal>
      )}
      {invitesOpen !== null && (
        <VettingInvitesDialog
          mode={invitesOpen}
          corporationId={corporationId}
          invites={overview.invites}
          inviteOnly={inviteOnly}
          onCreate={async (label) => {
            const next = await vettingBackend().createInvite(characterId, corporationId, label);
            replace(next);
            return next.invites;
          }}
          onRevoke={async (code) => {
            replace(await vettingBackend().revokeInvite(characterId, corporationId, code));
          }}
          onClose={() => setInvitesOpen(null)}
        />
      )}
      {requesting && (
        <ReviewMemberDialog
          roster={roster}
          mark={(members) =>
            markMembers(members, {
              selfId: characterId,
              waiting: new Map(
                overview.reviews
                  .filter((review) => review.state === 'requested' || review.state === 'open')
                  .map((review) => [
                    review.pilot.characterId,
                    {
                      at: review.createdAt,
                      ...(review.requestedBy ? { by: review.requestedBy.name } : {}),
                    },
                  ])
              ),
            })
          }
          onClose={() => setRequesting(false)}
          mail={{
            officerId: characterId,
            officerName: names.get(characterId) ?? '',
            send: requestMail.send,
            preview: requestMail.preview,
          }}
          onRequest={async (memberName, role) => {
            const next = await vettingBackend().request(
              characterId,
              corporationId,
              memberName,
              role
            );
            replace(next);
            return (
              next.reviews
                .filter(
                  (review) =>
                    review.state === 'requested' &&
                    review.pilot.name.toLowerCase() === memberName.toLowerCase()
                )
                .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
            );
          }}
        />
      )}
    </>,
    settingsGear
  );
}
