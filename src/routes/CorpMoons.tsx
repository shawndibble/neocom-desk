/**
 * `/corp/moons` — the Corp Tax Book (issue #4063, epic #4055, D21): Extractions,
 * Miners and Statements as path-segment tabs (ADR 0015), the moon and Miner
 * pages below their tabs, settings behind the header's gear and the audit log
 * behind Activity.
 *
 * Visible to a Character whose roles can view the book (D8: Director,
 * Accountant, Junior_Accountant); syncing it is the refinery ledger's
 * (`miningLedgerAccess`, Accountant), so a viewer without that role reads what
 * an Accountant synced and sees no Sync action. An Accountant who has not
 * granted the mining scope yet is asked for it here, the first screen that
 * needs it (#4058). The book itself
 * is read through the officer rules, so the Character is verified first
 * (`useCorpBook`), and a corporation with no book shows the Director's turn-on.
 */
import { useEffect, useState } from 'react';
import { canViewCorpTaxBook } from '@/engine/corpRoles';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  IconButton,
  LoadFailedState,
  PageHeader,
  SlideOver,
  Spinner,
  Tabs,
  Toast,
  useTabsId,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { tabBarTabs, tabPath } from '@/lib/pageTabs';
import { usePageTab } from '@/lib/usePageTab';
import { formatAge } from '@/lib/age';
import { CorpDenied } from '@/features/corp/CorpDenied';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useCorpTaxBook } from '@/features/corp/taxBook/useCorpTaxBook';
import { AuditFeed } from '@/features/corp/moons/AuditFeed';
import { useAuditSubject } from '@/features/corp/moons/useAuditSubject';
import { useBookAudit } from '@/features/corp/moons/useBookAudit';
import { BookProvider } from '@/features/corp/moons/BookContext';
import { useBook } from '@/features/corp/moons/useBook';
import { BookHealthStrip } from '@/features/corp/moons/BookHealthStrip';
import { DeleteBookDialog } from '@/features/corp/moons/DeleteBookSection';
import { BookSettingsDialog } from '@/features/corp/moons/BookSettingsDialog';
import { ExtractionsTab } from '@/features/corp/moons/ExtractionsTab';
import { InviteMoonOwnerDialog } from '@/features/corp/moons/InviteMoonOwnerDialog';
import { MinerDetail } from '@/features/corp/moons/MinerDetail';
import { MinersTab } from '@/features/corp/moons/MinersTab';
import { OverviewTab } from '@/features/corp/moons/OverviewTab';
import { MoonDetail } from '@/features/corp/moons/MoonDetail';
import { MoonOwnerDetail } from '@/features/corp/moons/MoonOwnerDetail';
import { MoonOwnersTab } from '@/features/corp/moons/MoonOwnersTab';
import { MOONS_TABS, moonsDetail } from '@/features/corp/moons/moonsPaths';
import { StatementsTab } from '@/features/corp/moons/StatementsTab';
import { MoonsSetup } from '@/features/corp/moons/MoonsSetup';
import { useCorpBook } from '@/features/corp/moons/useCorpBook';
import { useMoonOwners, useShowExtractions } from '@/features/corp/moons/useMoonOwners';
import { setMoonsTabsHidden } from '@/features/corp/moons/moonsTabsHidden';

function ActivityPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const audit = useBookAudit(200);
  const subject = useAuditSubject();
  return (
    <SlideOver open={open} onClose={onClose} title={t('corpTaxBook.moons.activity.title')} wide>
      {audit.loading ? (
        <Spinner label={t('common.loading')} />
      ) : (
        <AuditFeed entries={audit.entries} subject={subject} />
      )}
    </SlideOver>
  );
}

function ReadyBook({ sync }: { sync: ReturnType<typeof useCorpTaxBook> }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { view, canEdit, characterId, corporationId, names } = useBook();
  const showExtractions = useShowExtractions();
  // With no moon owners the empty state carries the invite button itself.
  const hasMoonOwners = useMoonOwners().rows.length > 0;
  const [tab, selectTab] = usePageTab(MOONS_TABS);
  const tabsId = useTabsId();
  // Back from EVE's page after the Automatic sync opt-in: show the settings it was pressed in.
  const { state: routerState } = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(
    () => (routerState as { corpSyncGrant?: unknown } | null)?.corpSyncGrant !== undefined
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const detail = moonsDetail(pathname);
  const status = sync.status;
  const meta =
    status.kind === 'never' ? (
      <span className="text-xs text-text-dim">{t('corpTaxBook.moons.neverSynced')}</span>
    ) : (
      <span className="text-xs text-text-dim">
        {t('corpTaxBook.moons.syncedBy', {
          age: formatAge(status.ageMs, t),
          name: status.scheduled
            ? t('corpTaxBook.moons.scheduledBy', { name: status.byName })
            : status.byName,
        })}
      </span>
    );
  // A corporation with no refineries of its own has nothing for Extractions to show.
  if (!showExtractions && (tab === 'extractions' || detail?.kind === 'extraction'))
    return <Navigate to={tabPath(MOONS_TABS, 'moon-owners')} replace />;
  const tabs = tabBarTabs(MOONS_TABS).filter((x) => showExtractions || x.id !== 'extractions');
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      {detail === null && (
        <>
          <PageHeader
            title={t('corp.moons.title')}
            meta={meta}
            actions={
              <span className="flex items-center gap-1">
                {tab === 'moon-owners' && canEdit && hasMoonOwners && (
                  <Button variant="ghost" onClick={() => setInviteOpen(true)}>
                    {t('corpTaxBook.moons.moonOwners.invite')}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setActivityOpen(true)}>
                  <Icon.Recent size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                  {t('corpTaxBook.moons.activity.button')}
                </Button>
                {sync.ledger.state === 'ready' && (
                  <IconButton
                    icon={<Icon.Refresh />}
                    label={t('corpTaxBook.moons.syncNow')}
                    onClick={() => void sync.sync()}
                    disabled={sync.run.phase === 'syncing'}
                  />
                )}
                <IconButton
                  icon={<Icon.Settings />}
                  label={t('corpTaxBook.moons.settings.open')}
                  onClick={() => setSettingsOpen(true)}
                />
              </span>
            }
          />
          <Tabs
            tabsId={tabsId}
            label={t('corpTaxBook.moons.title')}
            value={tab}
            onChange={(id) => selectTab(id as typeof tab)}
            tabs={tabs.map((x) => ({ id: x.id, label: t(x.labelKey) }))}
          />
          {sync.ledger.state !== 'ready' && (
            <p className="text-sm text-text-dim" role="note">
              {t('corpTaxBook.moons.viewOnly')}
            </p>
          )}
          <BookHealthStrip sync={sync} />
          {tab === 'overview' && <OverviewTab showMoons={showExtractions} />}
          {tab === 'extractions' && <ExtractionsTab />}
          {tab === 'miners' && <MinersTab />}
          {tab === 'statements' && <StatementsTab />}
          {tab === 'moon-owners' && <MoonOwnersTab onInvite={() => setInviteOpen(true)} />}
        </>
      )}
      {detail?.kind === 'extraction' && <MoonDetail id={detail.id} />}
      {detail?.kind === 'miner' && <MinerDetail id={detail.id} />}
      {detail?.kind === 'moonOwner' && <MoonOwnerDetail id={detail.id} />}
      {view && settingsOpen && (
        <BookSettingsDialog
          open
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setSaved(true)}
          onDeleteBook={() => setDeleteOpen(true)}
        />
      )}
      {deleteOpen && <DeleteBookDialog onClose={() => setDeleteOpen(false)} />}
      {saved && (
        <Toast message={t('corpTaxBook.moons.settings.saved')} onClose={() => setSaved(false)} />
      )}
      {inviteOpen && (
        <InviteMoonOwnerDialog
          characterId={characterId}
          corporationId={corporationId}
          characterName={names.character}
          onClose={() => setInviteOpen(false)}
        />
      )}
      {activityOpen && <ActivityPanel open onClose={() => setActivityOpen(false)} />}
    </div>
  );
}

function CorpMoonsView({ needsScope }: { needsScope: boolean }) {
  const { t } = useTranslation();
  const sync = useCorpTaxBook();
  const book = useCorpBook(sync);
  const { state } = book;
  // The rail and the page title list Moons' tabs only once a book mode is chosen.
  const unchosen = state.status === 'off';
  const decided = state.status === 'off' || state.status === 'ready';
  useEffect(() => {
    if (decided) setMoonsTabsHidden(unchosen);
    return () => setMoonsTabsHidden(false);
  }, [decided, unchosen]);

  if (state.status === 'loading') {
    return (
      <div className="flex justify-center p-8">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (state.status === 'failed') {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <LoadFailedState
          title={t('corpTaxBook.moons.failed')}
          hint={t('corpTaxBook.moons.failedHint')}
          onRetry={book.reload}
        />
        <p className="text-center text-xs text-text-dim">{state.message}</p>
      </div>
    );
  }
  if (state.status === 'denied' && state.unverified) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <PageHeader title={t('corp.moons.title')} />
        <LoadFailedState
          title={t('corpTaxBook.moons.unverified.title')}
          hint={t('corpTaxBook.moons.unverified.hint')}
          onRetry={book.reload}
        />
      </div>
    );
  }
  if (state.status === 'denied') {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <PageHeader title={t('corp.moons.title')} />
        <EmptyState
          title={t('corp.moons.noAccessTitle')}
          hint={state.message ?? t('corp.moons.noAccessHint')}
        />
      </div>
    );
  }
  if (state.status === 'off' && book.characterId !== null && book.corporationId !== null) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <PageHeader title={t('corp.moons.title')} />
        <MoonsSetup
          characterId={book.characterId}
          corporationId={book.corporationId}
          verdict={state.verdict}
          onDone={book.reload}
          onTurnedOn={() => void sync.sync()}
        />
      </div>
    );
  }
  if (state.status !== 'ready' || book.characterId === null || book.corporationId === null)
    return null;
  // Only a corporation with a book syncs it: a moon owner never needs the mining scope here.
  if (needsScope) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <PageHeader title={t('corp.moons.title')} />
        <EmptyState
          title={t('corpTaxBook.moons.scope.title')}
          hint={t('corpTaxBook.moons.scope.hint')}
          action={
            <Button variant="primary" onClick={() => void sync.ledger.request()}>
              {t('corpTaxBook.moons.scope.action')}
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <BookProvider
      value={{
        characterId: book.characterId,
        corporationId: book.corporationId,
        view: state.view,
        names: state.names,
        settings: state.settings,
        data: state.data,
        verdict: state.verdict,
        reload: book.reload,
      }}
    >
      <ReadyBook sync={sync} />
    </BookProvider>
  );
}

export function CorpMoons() {
  const { t } = useTranslation();
  const access = useCorpAccess();
  const { ledger } = useCorpTaxBook({ autoSync: false });
  if (access.state === 'unknown') {
    return (
      <div className="flex justify-center p-8">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (access.state !== 'ready') {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <PageHeader title={t('corp.moons.title')} />
        <CorpDenied
          reason={access.state === 'none' ? 'none' : access.state}
          title={t('corp.moons.noAccessTitle')}
          hint={t('corp.moons.noAccessHint')}
        />
      </div>
    );
  }
  const viewer = canViewCorpTaxBook(access.roles);
  if (!viewer && (ledger.state === 'unavailable' || ledger.state === 'unknown')) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <PageHeader title={t('corp.moons.title')} />
        <EmptyState title={t('corp.moons.noAccessTitle')} hint={t('corp.moons.noAccessHint')} />
      </div>
    );
  }
  return <CorpMoonsView needsScope={ledger.state === 'needs-scope'} />;
}
