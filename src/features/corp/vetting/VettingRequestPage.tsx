/**
 * `/vetting`: a member's side of a review an officer asked for before a promotion. Who asked
 * and for which role, the characters already on this device (read with the token they hold, no
 * second sign-in when it covers what the report reads), then Share or Decline. Once shared it is
 * the same status view an applicant sees.
 *
 * Only access tokens are sent, one per character, straight to the server's read.
 */
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  EmptyState,
  LiveStatus,
  LoadFailedState,
  PageHeader,
  Panel,
  Spinner,
} from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getValidAccessToken } from '@/auth/session';
import { db } from '@/db';
import type { VettingStatus } from '@/engine/vetting';
import { useCharacters } from '@/features/character/useCharacters';
import { callableErrorReason } from '@/lib/callableError';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { VettingCharacterList } from './VettingCharacterList';
import { VettingConsentTerms } from './VettingConsentTerms';
import { VettingStatusView } from './VettingStatusView';
import type { VettingHandle } from './vettingBackend';
import { vettingBackend } from './vettingClient';
import { clearVettingHandle, readVettingHandle, writeVettingHandle } from './vettingHandle';
import type { VettingLoginOutcome } from './vettingLoginState';
import { requestRows } from './vettingRows';
import { isReviewGone, vettingErrorKey } from './vettingView';

const NO_SCOPES: ReadonlyMap<number, readonly string[]> = new Map();

type Load =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; handle: VettingHandle | null };

interface VettingRequestPageProps {
  /** The vetting sign-in this visit came back from, if it did. */
  login: VettingLoginOutcome | null;
  /** Starts a vetting sign-in for a character whose device grant does not cover the report. */
  onSignIn: (corporationId: number, reviewId: string) => void;
}

export function VettingRequestPage({ login, onSignIn }: VettingRequestPageProps) {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const characters = useCharacters();
  // Only each Character's granted scopes leave the token read, never a token (ADR 0001).
  const scopesById =
    useLiveQuery(
      async () =>
        new Map(
          (await db.tokens.toArray()).map((token) => [token.characterId, token.scopes ?? []])
        ),
      []
    ) ?? NO_SCOPES;
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [status, setStatus] = useState<VettingStatus | null>(null);
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(new Set());
  const [readingId, setReadingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [declining, setDeclining] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loginSpent = useRef(false);
  const started = useRef('');

  const fail = (err: unknown) => setError(t(vettingErrorKey(callableErrorReason(err))));

  useEffect(() => {
    if (characterId === null) return;
    // Once per Character and attempt, with no cancel flag (see `ApplyPage`).
    const key = `${characterId}:${attempt}`;
    if (started.current === key) return;
    started.current = key;
    const backend = vettingBackend();
    void (async () => {
      let handle: VettingHandle | null;
      let found: VettingStatus | null = null;
      try {
        const [request] = await backend.myRequests(characterId);
        if (request) {
          handle = request.handle;
          found = request.status;
        } else {
          // Already shared: the request is no longer waiting, but its status is still the pilot's.
          handle = readVettingHandle(`request:${characterId}`);
          if (handle) {
            try {
              found = await backend.status(handle);
            } catch (err) {
              if (!isReviewGone(callableErrorReason(err))) throw err;
              clearVettingHandle(`request:${characterId}`);
              handle = null;
            }
          }
        }
      } catch {
        setLoad({ status: 'failed' });
        return;
      }
      setStatus(found);
      setLoad({ status: 'ready', handle });

      if (loginSpent.current || login === null) return;
      loginSpent.current = true;
      if (login.status !== 'ok') {
        setError(t(`vetting.apply.signIn.${login.status}`));
        return;
      }
      if (handle === null || found?.state !== 'requested') return;
      setReadingId(login.characterId);
      setAnnounce(t('vetting.characters.readingNamed', { name: login.name }));
      try {
        setStatus(await backend.addCharacter(handle, login.accessToken));
        setAnnounce(t('vetting.characters.readNamed', { name: login.name }));
      } catch (err) {
        setError(t(vettingErrorKey(callableErrorReason(err))));
      } finally {
        setReadingId(null);
      }
    })();
  }, [characterId, attempt, login, t]);

  if (characterId === null || load.status === 'loading') {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  const page = (meta: string | undefined, body: React.ReactNode) => (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <PageHeader title={t('vetting.request.title')} meta={meta} />
      {body}
    </div>
  );
  if (load.status === 'failed') {
    return page(undefined, <LoadFailedState onRetry={() => setAttempt((n) => n + 1)} />);
  }
  const { handle } = load;
  if (handle === null || status === null) {
    return page(
      undefined,
      <Panel>
        <EmptyState title={t('vetting.request.none.title')} hint={t('vetting.request.none.hint')} />
      </Panel>
    );
  }

  if (status.state !== 'requested') {
    return page(
      status.corporationName,
      <VettingStatusView
        status={status}
        onWithdraw={
          status.state === 'declined' || status.state === 'withdrawn'
            ? undefined
            : async () => {
                await vettingBackend().withdraw(handle);
                clearVettingHandle(`request:${characterId}`);
                setStatus({ ...status, state: 'withdrawn' });
              }
        }
      />
    );
  }

  const rows = requestRows(characters, scopesById, status, readingId);
  const ticked = new Set(
    rows
      .filter((row) => row.state === 'ready' && !unticked.has(row.characterId))
      .map((row) => row.characterId)
  );
  const alreadyRead = status.characters.length;
  const sharing = alreadyRead + ticked.size;
  const onDevice = rows.filter((row) => row.state !== 'needsSignIn').length;
  const role = status.role ?? '';
  const asker = status.requestedBy?.name ?? t('vetting.request.anOfficer');

  const share = async () => {
    if (busy || sharing === 0) return;
    setBusy(true);
    setError(null);
    const backend = vettingBackend();
    try {
      for (const row of rows) {
        if (!ticked.has(row.characterId)) continue;
        setReadingId(row.characterId);
        setAnnounce(t('vetting.characters.readingNamed', { name: row.name }));
        setStatus(await backend.addCharacter(handle, await getValidAccessToken(row.characterId)));
      }
      setReadingId(null);
      const sent = await backend.submit(handle, '');
      writeVettingHandle(`request:${characterId}`, handle);
      setStatus(sent);
    } catch (err) {
      fail(err);
    } finally {
      setReadingId(null);
      setBusy(false);
    }
  };

  return page(
    status.corporationName,
    <>
      <Panel title={t('vetting.request.promotion', { role })}>
        <div className="space-y-2 text-sm">
          <p>
            <Trans
              i18nKey="vetting.request.asked"
              values={{ name: asker, role }}
              components={{ b: <span className="font-semibold" /> }}
            />
          </p>
          <p className="text-text-dim">{t('vetting.request.oneTime')}</p>
        </div>
      </Panel>
      <Panel
        title={t('vetting.request.charactersTitle')}
        meta={t('vetting.request.onDevice', { count: onDevice, total: rows.length })}
        metaOwnRow
        padded={false}
      >
        <VettingCharacterList
          rows={rows}
          busy={busy || readingId !== null}
          tick={{
            checked: new Set([
              ...ticked,
              ...status.characters.map((character) => character.characterId),
            ]),
            onToggle: (id) =>
              setUnticked((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              }),
          }}
          onSignIn={() => onSignIn(handle.corporationId, handle.reviewId)}
        />
      </Panel>
      <LiveStatus>{announce}</LiveStatus>
      {error && <InlineError>{error}</InlineError>}
      <Panel title={t('vetting.consent.title')}>
        <VettingConsentTerms readers="officers" />
      </Panel>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          loading={busy}
          aria-disabled={sharing === 0 || undefined}
          onClick={sharing === 0 ? undefined : () => void share()}
        >
          {t('vetting.request.share', { count: sharing })}
        </Button>
        <Button onClick={() => setDeclining(true)}>{t('vetting.request.decline')}</Button>
        <span className="text-xs text-text-dim">{t('vetting.request.declineHint')}</span>
      </div>
      <ConfirmDialog
        open={declining}
        title={t('vetting.request.declineConfirm.title')}
        body={t('vetting.request.declineConfirm.body', { name: asker })}
        actionLabel={t('vetting.request.declineConfirm.action')}
        cancelLabel={t('common.cancel')}
        failedLabel={t('vetting.errors.generic')}
        onConfirm={async () => {
          await vettingBackend().decline(handle);
          setStatus({ ...status, state: 'declined' });
        }}
        onClose={() => setDeclining(false)}
      />
    </>
  );
}
