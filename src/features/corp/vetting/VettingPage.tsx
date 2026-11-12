/**
 * `/corp/vetting`'s body, for a reviewer: the queue of open reviews, the decided ones, and (for
 * a Director) settings. A path below Open or Decided is one review's report, drawn as a page of
 * its own with a crumb back.
 */
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  LiveStatus,
  LoadFailedState,
  PageHeader,
  Panel,
  SegmentedControl,
  Spinner,
  Tabs,
  Tooltip,
  useTabPanelProps,
  useTabsId,
} from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { useIsPhone } from '@/lib/useIsPhone';
import { usePageTab } from '@/lib/usePageTab';
import { ReviewMemberDialog } from './ReviewMemberDialog';
import { VettingQueue } from './VettingQueue';
import { VettingReport } from './VettingReport';
import { VettingInvitesDialog } from './VettingInvitesDialog';
import { VettingSettingsView } from './VettingSettingsView';
import { vettingBackend } from './vettingClient';
import {
  VETTING_TABS,
  reviewIdFromPathname,
  reviewPath,
  settingsSectionFromPathname,
  type VettingTabId,
} from './vettingTabs';
import { applyLink } from './vettingText';
import { isDecided, needsYours } from './vettingView';
import { useVettingOverview } from './useVettingOverview';

export function VettingPage() {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const phone = useIsPhone();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [tab, selectTab] = usePageTab(VETTING_TABS);
  const { state, characterId, corporationId, reload, replace } = useVettingOverview();
  const { copied, flash } = useCopyFeedback(2000);
  const [requesting, setRequesting] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState<'new' | 'list' | null>(null);
  const reviewId = reviewIdFromPathname(pathname);
  const canConfigure = state.status === 'ready' && state.overview.canConfigure;
  const shown: VettingTabId = tab === 'settings' && !canConfigure ? 'open' : tab;
  const panel = useTabPanelProps(phone ? null : tabsId, shown);

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

  const page = (body: React.ReactNode) => (
    <div className="mx-auto max-w-page space-y-4 px-4 py-4">
      <PageHeader title={t('vetting.title')} />
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
  const open = overview.reviews.filter((review) => !isDecided(review.state));
  const decided = overview.reviews.filter((review) => isDecided(review.state));
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
    ...(canConfigure ? [{ id: 'settings' as const, label: t('vetting.tabs.settings') }] : []),
  ];

  const copy = async () => {
    try {
      await writeToClipboard(applyLink(corporationId));
      flash();
    } catch {
      // The clipboard was refused; nothing was copied and nothing claims it was.
    }
  };
  // By invite, the bare apply link takes nobody anywhere: the header makes an invite link instead.
  const { inviteOnly } = overview.settings;
  const copyButton = inviteOnly ? (
    <Button aria-disabled={!on || undefined} onClick={on ? () => setInvitesOpen('new') : undefined}>
      {t('vetting.newInvite')}
    </Button>
  ) : (
    <Button aria-disabled={!on || undefined} onClick={on ? () => void copy() : undefined}>
      {t(copied ? 'vetting.copied' : 'vetting.copyLink')}
    </Button>
  );
  const showInvites = inviteOnly || overview.invites.length > 0;

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
          {showInvites && (
            <Button onClick={() => setInvitesOpen('list')}>{t('vetting.invites.open')}</Button>
          )}
          <Button onClick={() => setRequesting(true)}>{t('vetting.reviewMember')}</Button>
        </span>
        <LiveStatus>{copied ? t('vetting.copied') : ''}</LiveStatus>
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
      <div {...panel}>
        {shown === 'settings' ? (
          <VettingSettingsView
            settings={overview.settings}
            section={settingsSectionFromPathname(pathname)}
            invites={overview.invites.length}
            onManageInvites={() => setInvitesOpen('list')}
            onSave={async (patch) => {
              replace(await vettingBackend().saveSettings(characterId, corporationId, patch));
            }}
          />
        ) : (
          <VettingQueue
            tab={shown}
            rows={shown === 'open' ? open : decided}
            onOpen={(review) => navigate(reviewPath(shown, review.id))}
          />
        )}
      </div>
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
          onClose={() => setRequesting(false)}
          onRequest={async (memberName, role) => {
            replace(await vettingBackend().request(characterId, corporationId, memberName, role));
          }}
        />
      )}
    </>
  );
}
