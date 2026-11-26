import { cx } from '@/lib/cx';
import { tappableRowClassName } from '@/components/ui/controlStyles';
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
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { InlineError } from '@/components/ui/InlineError';
import {
  settleVettingAnswers,
  VETTING_ANSWER_MAX,
  VETTING_MAX_CHARACTERS,
  VETTING_NOTE_MAX,
  type VettingCorpInfo,
  type VettingMinimumId,
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
import { clearVettingDraft, readVettingDraft, writeVettingDraft } from './vettingDraft';
import { clearVettingHandle, readVettingHandle, writeVettingHandle } from './vettingHandle';
import type { VettingLoginOutcome } from './vettingLoginState';
import { applicationRows } from './vettingRows';
import { minimumLine } from './vettingText';
import {
  askedMinimums,
  isReviewGone,
  sendBlock,
  unmetFromRefusal,
  vettingErrorKey,
  type SendBlock,
} from './vettingView';

const SEND_HINT: Record<SendBlock, string> = {
  characters: 'vetting.apply.sendHint',
  reading: 'vetting.apply.sendHint',
  minimums: 'vetting.apply.sendNeedsMinimums',
  answers: 'vetting.apply.sendNeedsAnswers',
  tick: 'vetting.apply.sendNeedsTick',
};

type Boot =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'missing' }
  | { status: 'ready'; corp: VettingCorpInfo };

interface ApplyPageProps {
  corporationId: number | null;
  invite?: string | null;
  login: VettingLoginOutcome | null;
  onSignIn: (reviewId?: string) => void;
  onOpenApp?: () => void;
}

export function ApplyPage({ corporationId, invite, login, onSignIn, onOpenApp }: ApplyPageProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [loadedBoot, setLoadedBoot] = useState<Boot>({ status: 'loading' });
  const [handle, setHandle] = useState<VettingHandle | null>(null);
  const [status, setStatus] = useState<VettingStatus | null>(null);
  const [reading, setReading] = useState<{ characterId: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [allMine, setAllMine] = useState(false);
  const [note, setNote] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [refused, setRefused] = useState<readonly VettingMinimumId[]>([]);
  const [busy, setBusy] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const [startingOver, setStartingOver] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loginSpent = useRef(false);
  const started = useRef(-1);

  const fail = useCallback(
    (err: unknown) => setError(t(vettingErrorKey(callableErrorReason(err)))),
    [t]
  );
  const code = invite?.trim() || null;

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    if (corporationId === null) return;
    const backend = vettingBackend();
    void (async () => {
      let corp: VettingCorpInfo;
      let held = readVettingHandle(`apply:${corporationId}`);
      let found: VettingStatus | null = null;
      try {
        corp = await (code === null
          ? backend.corpInfo(corporationId)
          : backend.corpInfo(corporationId, code));
        if (held) {
          try {
            found = await backend.status(held);
          } catch (err) {
            if (!isReviewGone(callableErrorReason(err))) throw err;
            clearVettingHandle(`apply:${corporationId}`);
            held = null;
          }
        }
      } catch (err) {
        const reason = callableErrorReason(err);
        setLoadedBoot({
          status: reason === 'unknown-corp' || reason === 'not-found' ? 'missing' : 'failed',
        });
        return;
      }
      setHandle(held);
      setStatus(found);
      const kept =
        held !== null && (found === null || found.state === 'draft')
          ? readVettingDraft(held.reviewId)
          : null;
      if (kept !== null) {
        setAnswers(kept.answers);
        setNote(kept.note);
        setAllMine(kept.allMine);
      }
      setLoadedBoot({ status: 'ready', corp });

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
          const begun = await (code === null
            ? backend.start(corporationId, login.accessToken)
            : backend.start(corporationId, login.accessToken, code));
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
  }, [attempt, corporationId, code, login, t, fail]);

  const act = async (run: (held: VettingHandle) => Promise<void>) => {
    if (handle === null || busy) return;
    setBusy(true);
    setError(null);
    setRefused([]);
    try {
      await run(handle);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (handle === null || corporationId === null) return;
    try {
      await vettingBackend().withdraw(handle);
    } catch (err) {
      if (!isReviewGone(callableErrorReason(err))) throw err;
    }
    clearVettingHandle(`apply:${corporationId}`);
    clearVettingDraft(handle.reviewId);
    setHandle(null);
    setStatus(null);
    setAllMine(false);
    setNote('');
    setAnswers({});
    setRefused([]);
    setError(null);
    setAnnounce('');
  };

  const signIn = (reviewId?: string) => {
    if (reviewId !== undefined) writeVettingDraft(reviewId, { answers, note, allMine });
    setSigningIn(true);
    onSignIn(reviewId);
  };

  const boot: Boot = corporationId === null ? { status: 'missing' } : loadedBoot;
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
            await discard();
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
  const line = (id: VettingMinimumId) => minimumLine(id, corp.minimums[id], t);
  if (rows.length === 0 && handle === null) {
    if (corp.inviteOnly && !corp.inviteOk) {
      return (
        <>
          {heading(t('vetting.apply.sub.inviteOnly'))}
          <Panel>
            <EmptyState
              title={t('vetting.apply.inviteOnly.title', { corp: corp.name })}
              hint={t('vetting.apply.inviteOnly.hint')}
            />
          </Panel>
        </>
      );
    }
    const asked = askedMinimums(corp.minimums);
    return (
      <>
        {heading(t('vetting.apply.sub.start'))}
        {corp.welcome !== '' && (
          <Panel title={t('vetting.apply.welcome', { corp: corp.name })}>
            <p className="text-sm break-words whitespace-pre-wrap">{corp.welcome}</p>
          </Panel>
        )}
        {asked.length > 0 && (
          <Panel title={t('vetting.apply.asks.title')}>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {asked.map(({ id }) => (
                <li key={id}>{line(id)}</li>
              ))}
            </ul>
          </Panel>
        )}
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
  const questions = status?.questions ?? [];
  const given = questions.map((question) => ({
    questionId: question.id,
    answer: answers[question.id] ?? '',
  }));
  const unmet = [...new Set([...(status?.unmet ?? []), ...refused])];
  const block = sendBlock({
    characters: read,
    allMine,
    reading: reading !== null,
    unmet: unmet.length,
    unanswered: settleVettingAnswers(questions, given).unanswered.length,
  });
  const sendable = block === null;
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
      {unmet.length > 0 && reading === null && (
        <div className="space-y-1 text-sm text-warning">
          <p>{t('vetting.apply.asks.unmet', { corp: corp.name })}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {unmet.map((id) => (
              <li key={id}>{line(id)}</li>
            ))}
          </ul>
        </div>
      )}
      <Panel title={t('vetting.apply.before.title')}>
        <div className="space-y-3 text-sm">
          {questions.map((question) => (
            <label key={question.id} className="block space-y-1">
              <span className="text-xs text-text-dim">
                {question.required
                  ? t('vetting.apply.before.required', { label: question.label })
                  : question.label}
              </span>
              <TextArea
                rows={2}
                maxLength={VETTING_ANSWER_MAX}
                aria-required={question.required || undefined}
                value={answers[question.id] ?? ''}
                onChange={(event) =>
                  setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))
                }
              />
            </label>
          ))}
          <label className={cx(tappableRowClassName, 'flex items-start gap-2')}>
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
                    try {
                      setStatus(await vettingBackend().submit(held, note.trim(), given));
                      clearVettingDraft(held.reviewId);
                    } catch (err) {
                      const named = unmetFromRefusal(err);
                      if (callableErrorReason(err) !== 'below-minimum' || named.length === 0) {
                        throw err;
                      }
                      setRefused(named);
                    }
                  })
              : undefined
          }
        >
          {t('vetting.apply.send', { corp: corp.name })}
        </Button>
        <span className="text-xs text-text-dim">
          {t(block === null ? 'vetting.apply.sendHint' : SEND_HINT[block], { corp: corp.name })}
        </span>
        {handle !== null && (
          <Button className="sm:ml-auto" onClick={() => setStartingOver(true)}>
            {t('vetting.apply.startOver.action')}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={startingOver}
        title={t('vetting.apply.startOver.title')}
        body={t('vetting.apply.startOver.body', { corp: corp.name })}
        actionLabel={t('vetting.apply.startOver.action')}
        cancelLabel={t('common.cancel')}
        failedLabel={t('vetting.errors.generic')}
        onConfirm={discard}
        onClose={() => setStartingOver(false)}
      />
    </>
  );
}
