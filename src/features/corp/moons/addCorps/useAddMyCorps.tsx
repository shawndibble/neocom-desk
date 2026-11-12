/**
 * "Add my other corps" as one hook for the Moons page: the header button's
 * state, the one-time New corp banner, the resume notice, the Needs you panel
 * and the dialogs (picker, hidden corps, confirm, guided sign-in). The page
 * places the pieces; the run itself is persisted (`useAddCorpsRun`) because
 * EVE's login leaves the page between corporations.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { beginAlertsLogin, beginOwnCorpGrantLogin } from '@/app/loginFlow';
import {
  current,
  currentAlerts,
  isDone,
  progress,
  type AddCorpsCandidate,
  type AddCorpsOutcome,
  type CoverageChoice,
  coverageFromForChoice,
} from '@/engine/corpTaxBook/addCorpsRun';
import type { MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { utcDay } from '@/engine/localDay';
import type { OwnCorpGrantCallbackState, OwnCorpGrantOutcome } from '../../taxBook/ownCorpGrant';
import {
  alertsReturnFor,
  useAlertsGrants,
  type AlertsCallbackState,
} from '@/features/notifications/alertsGrant';
import { planAlertsStepFor } from '@/features/notifications/alertsStepFor';
import { rememberEditedBook } from '../editedBook';
import { useBook } from '../useBook';
import { useAddCorpsRun, useAddCorpsRunStore } from '../useAddCorpsRun';
import { newCorps, useMoonsHiddenCorps, useMoonsHiddenCorpsStore } from '../moonsHiddenCorps';
import { useOwnCeoCorps, verifyOwnCeoCorp } from '../useOwnCeoCorps';
import { connectedInRun, needsYou } from './addCorpsStatus';
import { NewCorpBanner, ResumeNotice } from './AddCorpsNotices';
import { ConfirmBatchDialog } from './ConfirmBatchDialog';
import { CorpStatusPanel } from './CorpStatusPanel';
import { HiddenCorpsDialog } from './HiddenCorpsDialog';
import { PickCorpsDialog } from './PickCorpsDialog';
import { SignInSequenceDialog } from './SignInSequenceDialog';

type Stage =
  | { kind: 'closed' }
  | { kind: 'pick'; initial: number[]; hiddenOpen: boolean }
  | { kind: 'confirm'; corps: AddCorpsCandidate[] }
  | { kind: 'sign-in' };

/** What EVE's return says, as the outcome the run records. */
export function outcomeOfGrant(grant: OwnCorpGrantOutcome): AddCorpsOutcome {
  switch (grant.status) {
    case 'connected':
      return { kind: 'connected' };
    case 'wrong-character':
      return { kind: 'wrong-character', signedInAs: grant.signedInAs };
    case 'refused':
      return { kind: 'refused', reason: grant.reason };
    case 'cancelled':
      return { kind: 'cancelled' };
  }
}

/** A moon owner row that is on the book in any live way (the picker never offers it again). */
const LIVE = new Set([
  'active',
  'cant-read',
  'removal-pending',
  'disconnected',
  'settled-otherwise',
]);

export interface AddMyCorps {
  /** Whether the header button shows. */
  showButton: boolean;
  open: () => void;
  /** Banner and resume notice, for above the moon owners. */
  notices: ReactNode;
  /** The Needs you panel; null when nothing needs the player. */
  needsYou: ReactNode;
  /** Every dialog this feature opens. */
  dialogs: ReactNode;
}

export function useAddMyCorps(rows: readonly MoonOwnerRow[]): AddMyCorps {
  const { characterId, corporationId, canEdit, reload, names } = useBook();
  const own = useOwnCeoCorps(corporationId, canEdit);
  const hidden = useMoonsHiddenCorps();
  const { run, start, recordOutcome, recordAlertsOutcome, stop, retry } = useAddCorpsRun();
  const alertsGrants = useAlertsGrants();
  const location = useLocation();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>({ kind: 'closed' });
  const [notNow, setNotNow] = useState<ReadonlySet<number>>(new Set());
  const [showOutcome, setShowOutcome] = useState(false);

  // EVE's return carries its result as router state: read it once, record it, clear it.
  const arrivalState = location.state as Partial<
    OwnCorpGrantCallbackState & AlertsCallbackState
  > | null;
  const arrival = useRef(arrivalState?.ownCorpGrant);
  const alertsArrival = useRef(arrivalState?.alertsGrant);
  const handled = useRef(false);
  useEffect(() => {
    void useMoonsHiddenCorpsStore.getState().hydrate();
    void (async () => {
      await useAddCorpsRunStore.getState().hydrate();
      const grant = arrival.current;
      const alerts = alertsArrival.current;
      if ((!grant && !alerts) || handled.current) return;
      handled.current = true;
      navigate(location.pathname, { replace: true, state: null });
      const saved = useAddCorpsRunStore.getState().value;
      if (!saved) return;
      if (grant) {
        if (current(saved)?.corporationId !== grant.corporationId) return;
        await recordOutcome(outcomeOfGrant(grant));
        if (grant.status === 'connected') reload();
      } else if (alerts) {
        const step = currentAlerts(saved);
        const outcome = step && alertsReturnFor(alerts, step.ceoCharacterId);
        if (!outcome) return;
        await recordAlertsOutcome(outcome);
      }
      setShowOutcome(true);
      const next = useAddCorpsRunStore.getState().value;
      setStage(next && !isDone(next) ? { kind: 'sign-in' } : { kind: 'closed' });
    })();
    // Only on arrival: the grant and the page are fixed for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onBook = useMemo(
    () => new Set(rows.filter((r) => LIVE.has(r.status)).map((r) => r.corporationId)),
    [rows]
  );
  const hiddenIds = useMemo(() => new Set(hidden.hidden), [hidden.hidden]);
  // Remembered for "Finish setting up" after a sign-in (#6103), so it can offer a CEO's corp here.
  const onBookKey = [...onBook].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (!canEdit) return;
    void rememberEditedBook({
      collectorCorporationId: corporationId,
      editorCharacterId: characterId,
      onBook: [...onBook],
    }).catch(() => undefined);
    // `onBookKey` stands for `onBook`, a new Set on every rows change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, corporationId, characterId, onBookKey]);
  // Closed-app alerts are on for the account when any Character's grant is active.
  const alertsOn = Object.values(alertsGrants).some((g) => g.status === 'active');
  const lacksAlerts = (corps: readonly AddCorpsCandidate[]) =>
    alertsOn
      ? corps.map((c) => c.ceoCharacterId).filter((id) => alertsGrants[id]?.status !== 'active')
      : [];
  const offered = own.corps.filter(
    (c) => !hiddenIds.has(c.corporationId) && !onBook.has(c.corporationId)
  );
  const hiddenCorps = own.corps.filter((c) => hiddenIds.has(c.corporationId));
  const fresh =
    canEdit && hidden.hydrated && !own.loading && stage.kind === 'closed'
      ? newCorps(own.corps, { hidden: hidden.hidden, seen: hidden.seen, connected: onBook }).find(
          (c) => !notNow.has(c.corporationId)
        )
      : undefined;

  const openPicker = (initial: number[] = []) => {
    setStage({ kind: 'pick', initial, hiddenOpen: false });
    void hidden.markSeen(own.corps.map((c) => c.corporationId));
  };
  const openSignIn = () => {
    setShowOutcome(false);
    setStage({ kind: 'sign-in' });
  };

  const pending = run !== null && !isDone(run);
  // Own corps the player is CEO of: the ones Grant again can sign in for.
  const grantable = useMemo(() => new Set(own.corps.map((c) => c.corporationId)), [own.corps]);
  const items = canEdit ? needsYou(run, rows, names.corporation, grantable) : [];
  // Grant again is one guided pass over every own corp without names, the clicked one first.
  const grantAgain = (id: number) => {
    const wanted = items.filter((i) => i.state === 'needs-names').map((i) => i.corporationId);
    const queue = [id, ...wanted.filter((w) => w !== id)].flatMap((w) =>
      own.corps.filter((c) => c.corporationId === w)
    );
    // A run still in progress is never replaced: Continue finishes it first.
    if (queue.length === 0 || pending) return;
    void start({
      collectorCorporationId: corporationId,
      editorCharacterId: characterId,
      queue,
    }).then(openSignIn);
  };

  const notices = canEdit ? (
    <>
      {fresh && (
        <NewCorpBanner
          name={fresh.name}
          ceoName={fresh.ceoName}
          onConnect={() => openPicker([fresh.corporationId])}
          onNotNow={() => setNotNow((s) => new Set(s).add(fresh.corporationId))}
          onDontAsk={() => void hidden.hide(fresh.corporationId)}
        />
      )}
      {pending && stage.kind === 'closed' && (
        <ResumeNotice {...progress(run)} onContinue={openSignIn} />
      )}
    </>
  ) : null;

  const needsYouPanel =
    items.length === 0 ? null : (
      <CorpStatusPanel
        items={items}
        {...(run ? { connected: connectedInRun(run), total: run.queue.length } : {})}
        onSignInAgain={(id) => void retry(id).then(openSignIn)}
        onGrantAgain={grantAgain}
        onRemove={async (id) => {
          const { removeOwnCorpFeederRemote } = await import('@/sync/corpSyncGrantApi');
          const out = await removeOwnCorpFeederRemote({
            editorCharacterId: characterId,
            collectorCorporationId: corporationId,
            feederCorporationId: id,
          });
          if (out.ok) reload();
          return out.ok;
        }}
      />
    );

  const dialogs = (
    <>
      {stage.kind === 'pick' && (
        <PickCorpsDialog
          corps={offered}
          loading={own.loading}
          error={own.error}
          initialSelected={stage.initial}
          hiddenCount={hiddenCorps.length}
          onDontAsk={(id) => void hidden.hide(id)}
          onOpenHidden={() => setStage({ ...stage, hiddenOpen: true })}
          onContinue={(corps) => setStage({ kind: 'confirm', corps })}
          onClose={() => setStage({ kind: 'closed' })}
        />
      )}
      {stage.kind === 'pick' && stage.hiddenOpen && (
        <HiddenCorpsDialog
          corps={hiddenCorps}
          onAdd={(id) => void hidden.unhide(id)}
          onClose={() => setStage({ ...stage, hiddenOpen: false })}
        />
      )}
      {stage.kind === 'confirm' && (
        <ConfirmBatchDialog
          corps={stage.corps}
          offerAlerts={lacksAlerts(stage.corps).length > 0}
          onBack={() =>
            setStage({
              kind: 'pick',
              initial: stage.corps.map((c) => c.corporationId),
              hiddenOpen: false,
            })
          }
          onClose={() => setStage({ kind: 'closed' })}
          onConnect={(choice: CoverageChoice, alerts: boolean) =>
            void start({
              collectorCorporationId: corporationId,
              editorCharacterId: characterId,
              queue: stage.corps,
              coverageFrom: coverageFromForChoice(choice, utcDay()),
              ...(alerts ? { alertsFor: lacksAlerts(stage.corps) } : {}),
            }).then(openSignIn)
          }
        />
      )}
      {stage.kind === 'sign-in' && run && !isDone(run) && (
        <SignInSequenceDialog
          run={run}
          showOutcome={showOutcome}
          onClose={() => setStage({ kind: 'closed' })}
          onStop={() => void stop().then(() => setStage({ kind: 'closed' }))}
          onApproveAlerts={async () => {
            const { ceoCharacterId } = currentAlerts(run)!;
            // As Settings' walk would plan it; mail only after its own listing (ADR 0030).
            const step = await planAlertsStepFor(ceoCharacterId, { location: true, mail: false });
            return beginAlertsLogin(ceoCharacterId, { nearby: step.nearby, mail: step.mail });
          }}
          onSkipAlerts={() =>
            void recordAlertsOutcome({ kind: 'skipped' }).then(() => {
              const next = useAddCorpsRunStore.getState().value;
              setShowOutcome(true);
              if (!next || isDone(next)) setStage({ kind: 'closed' });
            })
          }
          onSignIn={async () => {
            const cur = current(run)!;
            // Read live right before leaving for EVE: a corporation or CEO that changed since
            // the list was built is recorded as not connected, with no login wasted on it.
            const check = await verifyOwnCeoCorp(cur);
            if (check === 'unreachable') throw new Error('Could not check the corporation');
            if (check === 'stale') {
              await recordOutcome({ kind: 'refused', reason: 'ceo-changed' });
              setShowOutcome(true);
              return;
            }
            return beginOwnCorpGrantLogin({
              characterId: run.editorCharacterId,
              expectedCeoCharacterId: cur.ceoCharacterId,
              collectorCorporationId: run.collectorCorporationId,
              feederCorporationId: cur.corporationId,
              ...(run.coverageFrom === undefined ? {} : { coverageFrom: run.coverageFrom }),
            });
          }}
        />
      )}
    </>
  );

  return {
    showButton: canEdit && (offered.length > 0 || hiddenCorps.length > 0 || run !== null),
    open: () => openPicker(),
    notices,
    needsYou: needsYouPanel,
    dialogs,
  };
}
