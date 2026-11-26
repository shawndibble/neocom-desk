import { useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, TextInput, Toast, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { LiveStatus } from '@/components/ui/LiveStatus';
import { buttonClassName } from '@/components/ui/buttonClassName';
import type { SurveyConnection } from '@/engine/miningTax/surveyConnection';
import { eveWhen } from '@/lib/eveTime';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { InfoRow } from './InfoRow';
import { blockedButtonClassName, blockedReasonClassName } from './blockedActionStyles';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useSurveyPayeeId } from '@/features/miningTax/surveyPayeePref';
import { loadPayees } from '@/features/miningTax/payees';
import {
  ensurePayee,
  findPayeeByName,
  initialTaxDraft,
  MINING_TAX_HREF,
  parseTaxPct,
  PayeeNotInEveError,
  type TaxDraft,
} from './moonTaxPayee';
import { setSurveyTax, type SurveyTaxShare } from './surveyStore';
import {
  useSurveyConnection,
  type ConnectableSurvey,
  type ConnectionToast,
} from './useSurveyConnection';

export interface TaxSurvey {
  id: string;
  expiresAt: number;
  published: SurveyTaxShare | null;
}

function useFailureMessage() {
  const { t } = useTranslation();
  return (cause: unknown) =>
    cause instanceof PayeeNotInEveError
      ? t(`survey.moonTax.notInEve.${cause.reason}`, { name: cause.payeeName })
      : t('survey.moonTax.failed');
}

function FailedLine({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <span role="alert" className="w-full text-xs text-danger">
      {message}
    </span>
  );
}

function ConnectedNote({ connection, nowMs }: { connection: SurveyConnection; nowMs: number }) {
  const { t } = useTranslation();
  const text =
    connection.systemId === null
      ? t('survey.moonTax.connectedNoLocation')
      : t('survey.moonTax.connected', { time: eveWhen(connection.untilMs, nowMs) });
  return (
    <>
      <LiveStatus>{text}</LiveStatus>
      <span className="flex items-center gap-1.5 self-center text-sm text-text-dim">
        <Icon.Pending size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        {text}
      </span>
    </>
  );
}

function ConnectionToastView({
  toast,
  onClose,
}: {
  toast: ConnectionToast | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (toast === null) return null;
  return (
    <Toast
      message={toast.message}
      undo={{ label: t('survey.moonTax.undo'), onUndo: toast.onUndo }}
      onClose={onClose}
    />
  );
}

function useManageTaxes(
  options: Omit<Parameters<typeof useSurveyConnection>[0], 'onFailed'>,
  onFailed: () => void
) {
  const moon = useSurveyConnection({ ...options, onFailed });
  const manageId = useId();
  const stopId = useId();
  const focusAfterCommit = useFocusAfterCommit();
  const byId = (id: string) => () => document.getElementById(id);
  return {
    ...moon,
    manageId,
    stopId,
    connect: async () => {
      await moon.connect();
      focusAfterCommit(byId(stopId));
    },
    stop: () => {
      void moon.stop().then(() => focusAfterCommit(byId(manageId)), onFailed);
    },
  };
}

function MoonConnectionSlot({
  moon,
  taxLink = true,
  children,
}: {
  moon: ReturnType<typeof useManageTaxes>;
  taxLink?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {moon.connection ? (
          <Button id={moon.stopId} size="sm" variant="ghost" onClick={moon.stop}>
            {t('survey.moonTax.stop')}
          </Button>
        ) : (
          children
        )}
        {taxLink && (
          <Link to={MINING_TAX_HREF} className={buttonClassName({ size: 'sm' })}>
            {t('survey.moonTax.openTax')}
          </Link>
        )}
        {moon.connection && <ConnectedNote connection={moon.connection} nowMs={moon.now} />}
      </div>
      <ConnectionToastView toast={moon.toast} onClose={moon.closeToast} />
    </>
  );
}

const NO_PAYEES: Awaited<ReturnType<typeof loadPayees>> = [];

export function MoonTaxRow({
  characterId,
  survey,
  connectable,
  draft,
  onDraftChange,
}: {
  characterId: number;
  survey?: TaxSurvey;
  connectable?: ConnectableSurvey;
  draft?: TaxDraft;
  onDraftChange?: (draft: TaxDraft) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const listId = useId();
  const [own, setOwn] = useState(() => initialTaxDraft(survey?.published));
  const saved = draft ?? own;
  const setSaved = onDraftChange ?? setOwn;
  const payees = useLiveQuery(() => loadPayees(characterId), [characterId]) ?? NO_PAYEES;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const failureMessage = useFailureMessage();
  const [focused, setFocused] = useState(false);
  const inFlight = useRef(false);

  const pct = parseTaxPct(saved.pct);
  const name = saved.name.trim();
  const ready = name !== '' && pct !== null;
  const moon = useManageTaxes(
    { characterId, survey: connectable, tax: ready ? { name, pct } : null, updateRate: true },
    () => setFailed(t('survey.moonTax.failed'))
  );

  const sent = useRef('');
  const surveyId = survey?.id;
  const surveyExpires = survey?.expiresAt;
  const published = survey?.published;
  useEffect(() => {
    if (surveyId === undefined || surveyExpires === undefined) return;
    if (focused || pct === null || name === '') return;
    if (published?.name === name && published.pct === pct) return;
    const key = `${surveyId}|${name}|${pct}`;
    if (sent.current === key) return;
    sent.current = key;
    void setSurveyTax({ id: surveyId, expiresAt: surveyExpires, name, pct, characterId }).catch(
      () => undefined
    );
  }, [surveyId, surveyExpires, published, focused, name, pct, characterId]);

  function changeName(next: string) {
    const known = findPayeeByName(payees, next);
    const fill = known !== undefined && known !== findPayeeByName(payees, saved.name);
    setSaved({ name: next, pct: fill ? String(known.defaultTaxPct) : saved.pct });
  }

  async function openTax() {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(null);
    try {
      if (connectable) {
        await moon.connect();
      } else {
        const payee = await ensurePayee(characterId, saved.name, pct);
        await useSurveyPayeeId.getState().setValue(payee.id);
        navigate(MINING_TAX_HREF);
      }
    } catch (cause) {
      setFailed(failureMessage(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function leave(event: FocusEvent<HTMLInputElement>) {
    if (!event.currentTarget.closest('[data-tax-fields]')?.contains(event.relatedTarget)) {
      setFocused(false);
    }
  }

  return (
    <InfoRow label={t('survey.moonTax.label')}>
      <div data-tax-fields className="flex min-w-0 flex-1 basis-72 items-center gap-2">
        <TextInput
          size="sm"
          list={listId}
          aria-label={t('survey.moonTax.payee')}
          className="min-w-0 flex-1 basis-56"
          value={saved.name}
          placeholder={t('survey.moonTax.payeePlaceholder')}
          onChange={(event) => changeName(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={leave}
        />
        <datalist id={listId}>
          {payees.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
        <span className="flex items-center gap-1">
          <TextInput
            size="sm"
            inputMode="decimal"
            aria-label={t('survey.moonTax.rate')}
            className="w-20 tabular-nums"
            value={saved.pct}
            placeholder="0"
            aria-invalid={saved.pct !== '' && pct === null}
            onChange={(event) => setSaved({ ...saved, pct: event.target.value })}
            onFocus={() => setFocused(true)}
            onBlur={leave}
          />
          <span className="text-text-dim">%</span>
        </span>
      </div>
      <MoonConnectionSlot moon={moon}>
        <Tooltip content={!ready ? t('common.needsInput') : null}>
          <Button
            id={moon.manageId}
            size="sm"
            aria-disabled={!ready || undefined}
            loading={busy}
            onClick={() => void openTax()}
          >
            {t('survey.moonTax.open')}
          </Button>
        </Tooltip>
      </MoonConnectionSlot>
      <FailedLine message={failed} />
    </InfoRow>
  );
}

export function MoonTaxReadout({
  tax,
  connectable,
}: {
  tax: SurveyTaxShare;
  connectable?: ConnectableSurvey;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const characterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const failureMessage = useFailureMessage();
  const inFlight = useRef(false);
  const hintId = useId();
  const loggedOut = characterId === null;
  const moon = useManageTaxes(
    { characterId, survey: connectable, tax: { name: tax.name, pct: tax.pct }, updateRate: false },
    () => setFailed(t('survey.moonTax.failed'))
  );

  async function open() {
    if (characterId === null || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(null);
    try {
      if (connectable) {
        await moon.connect();
      } else {
        const known = findPayeeByName(await loadPayees(characterId), tax.name);
        if (known) await useSurveyPayeeId.getState().setValue(known.id);
        navigate(MINING_TAX_HREF);
      }
    } catch (cause) {
      setFailed(failureMessage(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <InfoRow label={t('survey.moonTax.label')}>
      <p className="flex min-w-0 flex-1 basis-48 flex-wrap items-baseline gap-x-2 text-sm">
        <span className="tabular-nums">{tax.pct}%</span>
        <span className="text-text-dim">{t('survey.moonTax.to')}</span>
        <span className="min-w-0 [overflow-wrap:anywhere]">{tax.name}</span>
      </p>
      <MoonConnectionSlot moon={moon} taxLink={!loggedOut}>
        <div className={blockedButtonClassName}>
          <Button
            id={moon.manageId}
            size="sm"
            aria-disabled={loggedOut || undefined}
            aria-describedby={loggedOut ? hintId : undefined}
            loading={busy}
            onClick={() => void open()}
          >
            {t('survey.moonTax.manage')}
          </Button>
          {loggedOut && (
            <span id={hintId} className={blockedReasonClassName}>
              {t('survey.moonTax.needLogin')}
            </span>
          )}
        </div>
      </MoonConnectionSlot>
      <FailedLine message={failed} />
    </InfoRow>
  );
}
