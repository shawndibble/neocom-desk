/**
 * The public apply page's body (`/apply/<corpId>`): one page, four states. Start (how it works,
 * what is shared, the EVE sign-in), characters (each one read by the server as it signs in),
 * status once sent, and "not taking applications" for a corp with vetting off or unknown.
 *
 * An applicant has no account. Each EVE sign-in comes back as `login` with a short-lived access
 * token, which is handed to the server once and kept nowhere; the application itself is found
 * again through the `VettingHandle` in `localStorage`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  EmptyState,
  EveSsoButton,
  LiveStatus,
  LoadFailedState,
  Panel,
  Spinner,
  TextArea,
} from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import {
  VETTING_MAX_CHARACTERS,
  VETTING_NOTE_MAX,
  type VettingCorpInfo,
  type VettingStatus,
} from '@/engine/vetting';
import { callableErrorReason } from '@/lib/callableError';
import { useTimeZone } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';
import { VettingCharacterList } from './VettingCharacterList';
import { VettingConsentTerms } from './VettingConsentTerms';
import { ApplyHeading, VettingSteps } from './VettingPublicFrame';
import { VettingStatusView } from './VettingStatusView';
import type { VettingHandle } from './vettingBackend';
import { vettingBackend } from './vettingClient';
import { clearVettingHandle, readVettingHandle, writeVettingHandle } from './vettingHandle';
import type { VettingLoginOutcome } from './vettingLoginState';
import { applicationRows } from './vettingRows';
import { canSend, isReviewGone, vettingErrorKey } from './vettingView';

type Boot =
  | { status: 'loading' }
  | { status: 'failed' }
  /** No such corporation, or the id in the link is not one. */
  | { status: 'missing' }
  | { status: 'ready'; corp: VettingCorpInfo };

interface ApplyPageProps {
  /** Null when the link's id is not a number. */
  corporationId: number | null;
  /** The EVE sign-in this visit came back from, if it did. */
  login: VettingLoginOutcome | null;
  /** Starts an EVE sign-in for one more character; `reviewId` once there is a draft. */
  onSignIn: (reviewId?: string) => void;
  /** The optional "Open Neocom Desk" offer; absent for a pilot who already uses the app. */
  onOpenApp?: () => void;
}

export function ApplyPage({ corporationId, login, onSignIn, onOpenApp }: ApplyPageProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [loaded, setBoot] = useState<Boot>({ status: 'loading' });
  const [handle, setHandle] = useState<VettingHandle | null>(null);
  const [status, setStatus] = useState<VettingStatus | null>(null);
  const [reading, setReading] = useState<{ characterId: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [allMine, setAllMine] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The sign-in is spent on the first run: a retry of the page load must not read it again.
  const loginSpent = useRef(false);
  const started = useRef(-1);

  const fail = useCallback(
    (err: unknown) => setError(t(vettingErrorKey(callableErrorReason(err)))),
    [t]
  );

  useEffect(() => {
    // Once per attempt, with no cancel flag: StrictMode's second effect run must not start a
    // second read of the same character, and the first run's answer must still land.
    if (started.current === attempt) return;
    started.current = attempt;
    if (corporationId === null) return;
    const backend = vettingBackend();
    void (async () => {
      let corp: VettingCorpInfo;
      let held = readVettingHandle(`apply:${corporationId}`);
      let found: VettingStatus | null = null;
      try {
        corp = await backend.corpInfo(corporationId);
        if (held) {
          try {
            found = await backend.status(held);
          } catch (err) {
            if (!isReviewGone(callableErrorReason(err))) throw err;
            // Deleted since (decided long ago, or a draft that expired): start again.
            clearVettingHandle(`apply:${corporationId}`);
            held = null;
          }
        }
      } catch (err) {
        const reason = callableErrorReason(err);
        setBoot({
          status: reason === 'unknown-corp' || reason === 'not-found' ? 'missing' : 'failed',
        });
        return;
      }
      setHandle(held);
      setStatus(found);
      setBoot({ status: 'ready', corp });

      if (loginSpent.current || login === null) return;
      loginSpent.current = true;
      if (login.status !== 'ok') {
        setError(t(`vetting.apply.signIn.${login.status}`));
        return;
      }
      if (found !== null && found.state !== 'draft') return;
      setReading({ characterId: login.characterId, name: login.name });
      setAnnounce(t('vetting.characters.readingNamed', { name: login.name }));
      try {
        if (held === null) {
          const begun = await backend.start(corporationId, login.accessToken);
          writeVettingHandle(`apply:${corporationId}`, begun.handle);
          setHandle(begun.handle);
          setStatus(begun.status);
        } else {
          setStatus(await backend.addCharacter(held, login.accessToken));
        }
        setAnnounce(t('vetting.characters.readNamed', { name: login.name }));
      } catch (err) {
        fail(err);
      } finally {
        setReading(null);
      }
    })();
  }, [attempt, corporationId, login, t, fail]);

  const act = async (run: (held: VettingHandle) => Promise<void>) => {
    if (handle === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await run(handle);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const signIn = (reviewId?: string) => {
    setSigningIn(true);
    onSignIn(reviewId);
  };

  // A link whose id is not a number names no corporation: nothing to load.
  const boot: Boot = corporationId === null ? { status: 'missing' } : loaded;
  if (boot.status === 'loading') return <Spinner block="page" label={t('common.loading')} />;
  if (boot.status === 'failed') {
    return <LoadFailedState onRetry={() => setAttempt((n) => n + 1)} />;
  }
  if (boot.status === 'missing') {
    return (
      <Panel>
        <EmptyState
          title={t('vetting.apply.missing.title')}
          hint={t('vetting.apply.missing.hint')}
        />
      </Panel>
    );
  }
  const { corp } = boot;
  const heading = (sub: string) => <ApplyHeading name={corp.name} ticker={corp.ticker} sub={sub} />;

  if (withdrawn) {
    return (
      <>
        {heading(t('vetting.apply.sub.withdrawn'))}
        <Panel>
          <EmptyState
            title={t('vetting.apply.withdrawn.title')}
            hint={t('vetting.apply.withdrawn.hint')}
            action={
              corp.on ? (
                <Button onClick={() => setWithdrawn(false)}>
                  {t('vetting.apply.withdrawn.again')}
                </Button>
              ) : undefined
            }
          />
        </Panel>
      </>
    );
  }

  const drafting = status === null || status.state === 'draft';
  if (!drafting) {
    const when = status.decidedAt ?? status.readAt;
    return (
      <>
        {heading(
          when === null
            ? t('vetting.apply.sub.sentNoTime')
            : t(
                status.decidedAt !== null ? 'vetting.apply.sub.decided' : 'vetting.apply.sub.sent',
                {
                  when: formatTimestamp(new Date(when), timeZone),
                }
              )
        )}
        <VettingStatusView
          status={status}
          onWithdraw={async () => {
            if (handle === null) return;
            await vettingBackend().withdraw(handle);
            clearVettingHandle(`apply:${corp.corporationId}`);
            setHandle(null);
            setStatus(null);
            setAllMine(false);
            setNote('');
            setWithdrawn(true);
          }}
          onOpenApp={onOpenApp}
        />
      </>
    );
  }

  if (!corp.on && status === null) {
    return (
      <>
        {heading(t('vetting.apply.sub.off'))}
        <Panel>
          <EmptyState title={t('vetting.apply.off.title')} hint={t('vetting.apply.off.hint')} />
        </Panel>
      </>
    );
  }

  const rows = applicationRows(status, reading);
  if (rows.length === 0 && handle === null) {
    return (
      <>
        {heading(t('vetting.apply.sub.start'))}
        <Panel title={t('vetting.apply.how.title')}>
          <VettingSteps
            steps={[
              t('vetting.apply.how.signIn'),
              t('vetting.apply.how.read'),
              t('vetting.apply.how.report'),
            ]}
          />
        </Panel>
        <Panel title={t('vetting.consent.title')}>
          <VettingConsentTerms readers="recruiters" />
        </Panel>
        <div className="space-y-2">
          <EveSsoButton
            size="large"
            label={t('vetting.apply.signIn.first')}
            pending={signingIn}
            onClick={() => signIn()}
          />
          <p className="text-xs text-text-dim">{t('vetting.apply.signIn.firstHint')}</p>
          {error && <InlineError>{error}</InlineError>}
        </div>
      </>
    );
  }

  const read = status?.characters.length ?? 0;
  const full = read >= VETTING_MAX_CHARACTERS;
  const sendable = canSend({ characters: read, allMine, reading: reading !== null });
  return (
    <>
      {heading(t('vetting.apply.sub.characters'))}
      <Panel
        title={t('vetting.characters.title')}
        meta={t('vetting.characters.added', { count: read })}
        padded={false}
      >
        <VettingCharacterList
          rows={rows}
          busy={busy || reading !== null}
          onRemove={(row) =>
            void act(async (held) => {
              setStatus(await vettingBackend().removeCharacter(held, row.characterId));
            })
          }
          onSignIn={() => signIn(handle?.reviewId)}
        />
        <div className="flex flex-wrap items-center gap-3 border-t border-line p-3">
          {full ? (
            <span className="text-xs text-text-dim">
              {t('vetting.characters.full', { count: VETTING_MAX_CHARACTERS })}
            </span>
          ) : (
            <>
              <EveSsoButton
                size="small"
                label={t('vetting.apply.signIn.another')}
                pending={signingIn || reading !== null}
                onClick={() => signIn(handle?.reviewId)}
              />
              <span className="text-xs text-text-dim">{t('vetting.characters.addAnother')}</span>
            </>
          )}
        </div>
      </Panel>
      <LiveStatus>{announce}</LiveStatus>
      {error && <InlineError>{error}</InlineError>}
      <Panel title={t('vetting.apply.before.title')}>
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2">
            <Checkbox
              className="mt-0.5"
              checked={allMine}
              onChange={(event) => setAllMine(event.target.checked)}
            />
            <span>
              {t('vetting.apply.before.allMine')}
              <span className="block text-xs text-text-dim">
                {t('vetting.apply.before.allMineHint')}
              </span>
            </span>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-text-dim">{t('vetting.apply.before.note')}</span>
            <TextArea
              rows={2}
              maxLength={VETTING_NOTE_MAX}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>
      </Panel>
      <div className="flex flex-wrap items-center gap-3 max-sm:[&>button]:w-full">
        <Button
          variant="primary"
          loading={busy}
          aria-disabled={!sendable || undefined}
          onClick={
            sendable
              ? () =>
                  void act(async (held) => {
                    setStatus(await vettingBackend().submit(held, note.trim()));
                  })
              : undefined
          }
        >
          {t('vetting.apply.send', { corp: corp.name })}
        </Button>
        <span className="text-xs text-text-dim">
          {t(sendable || read === 0 ? 'vetting.apply.sendHint' : 'vetting.apply.sendNeedsTick')}
        </span>
      </div>
    </>
  );
}
