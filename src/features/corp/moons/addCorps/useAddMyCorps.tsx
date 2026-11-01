/**
 * "Add my other corps" as one hook for the Moons page: the header button's
 * state, the one-time New corp banner, the resume notice, the Needs you panel
 * and the dialogs (picker, hidden corps, confirm, guided sign-in). The page
 * places the pieces; the run itself is persisted (`useAddCorpsRun`) because
 * EVE's login leaves the page between corporations.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { beginOwnCorpGrantLogin } from '@/app/loginFlow';
import {
  current,
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
import { useBook } from '../useBook';
import { useAddCorpsRun, useAddCorpsRunStore } from '../useAddCorpsRun';
import { newCorps, useMoonsHiddenCorps, useMoonsHiddenCorpsStore } from '../moonsHiddenCorps';
import { useOwnCeoCorps } from '../useOwnCeoCorps';
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
  const own = useOwnCeoCorps(corporationId);
  const hidden = useMoonsHiddenCorps();
  const { run, start, recordOutcome, stop, retry } = useAddCorpsRun();
  const location = useLocation();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>({ kind: 'closed' });
  const [notNow, setNotNow] = useState<ReadonlySet<number>>(new Set());
  const [showOutcome, setShowOutcome] = useState(false);

  // EVE's return carries its result as router state: read it once, record it, clear it.
  const arrival = useRef(
    (location.state as Partial<OwnCorpGrantCallbackState> | null)?.ownCorpGrant
  );
  const handled = useRef(false);
  useEffect(() => {
    void useMoonsHiddenCorpsStore.getState().hydrate();
    void (async () => {
      await useAddCorpsRunStore.getState().hydrate();
      const grant = arrival.current;
      if (!grant || handled.current) return;
      handled.current = true;
      navigate(location.pathname, { replace: true, state: null });
      const saved = useAddCorpsRunStore.getState().value;
      if (!saved || current(saved)?.corporationId !== grant.corporationId) return;
      await recordOutcome(outcomeOfGrant(grant));
      if (grant.status === 'connected') reload();
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
  const items = canEdit ? needsYou(run, rows, names.corporation) : [];

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
          onBack={() =>
            setStage({
              kind: 'pick',
              initial: stage.corps.map((c) => c.corporationId),
              hiddenOpen: false,
            })
          }
          onClose={() => setStage({ kind: 'closed' })}
          onConnect={(choice: CoverageChoice) =>
            void start({
              collectorCorporationId: corporationId,
              editorCharacterId: characterId,
              queue: stage.corps,
              coverageFrom: coverageFromForChoice(choice, utcDay()),
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
          onSignIn={() => {
            const cur = current(run)!;
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
