/**
 * Moon ore is taxed by whoever owns the moon, so a Survey that shows any asks
 * who and at what rate, and hands both to the Moon Mining Tax tab. It is the
 * Moon tax row of the Additional information panel (`SurveyInfoPanel`): a rate
 * field and a name field, always shown like the location and notes, since a rate
 * means little without its payee. Focus leaving the pair saves it, as for the
 * other two. The name completes from the pilot's Payees (and fills in that
 * Payee's rate). Assign Taxes connects the Survey's moon to that Payee
 * (`useSurveyConnection`, issue #4684): the Payee is added if need be, ore
 * already mined there is assigned, and ore mined until the Survey's ETA is
 * assigned as it reaches the ledger, so the pilot never assigns it by hand.
 *
 * The fields start blank for each survey (only what the survey itself stored
 * comes back), so a tax is shown only when the pilot sets it.
 *
 * Shown on the owner's Survey tab only; everyone else gets the same line
 * read-only (`MoonTaxReadout`). Once the pilot is done editing, a complete
 * name and rate is also stored on the survey (`setSurveyTax`), so everyone with
 * the link sees it.
 */
import { useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, TextInput, Toast } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
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
  type TaxDraft,
} from './moonTaxPayee';
import { setSurveyTax, type SurveyTaxShare } from './surveyStore';
import {
  useSurveyConnection,
  type ConnectableSurvey,
  type ConnectionToast,
} from './useSurveyConnection';

/** The stored survey this row publishes its tax to, and what is already stored there. */
export interface TaxSurvey {
  id: string;
  expiresAt: number;
  published: SurveyTaxShare | null;
}

/** The Tax tab and Stop, then "Auto-assigned until …" on its own line below: what a connected Survey shows in place of Assign Taxes. */
function ConnectedNote({
  connection,
  nowMs,
  onStop,
  stopId,
}: {
  connection: SurveyConnection;
  nowMs: number;
  onStop: () => void;
  stopId: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex items-center gap-x-3 sm:ml-auto">
        <Link
          to={MINING_TAX_HREF}
          className={buttonClassName({ size: 'sm', className: 'touch:min-h-11' })}
        >
          {t('survey.moonTax.openTax')}
        </Link>
        <Button id={stopId} size="sm" variant="ghost" className="touch:min-h-11" onClick={onStop}>
          {t('survey.moonTax.stop')}
        </Button>
      </div>
      <span role="status" className="-mt-1 flex w-full items-center gap-1.5 text-sm text-text-dim">
        <Icon.Pending size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        {connection.systemId === null
          ? t('survey.moonTax.connectedNoLocation')
          : t('survey.moonTax.connected', { time: eveWhen(connection.untilMs, nowMs) })}
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

/**
 * The Survey connection behind Assign Taxes, with focus handed between Manage
 * Taxes and Stop as they swap places (DESIGN §6c focus) and a failed Stop or
 * Undo reported through `onFailed`.
 */
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

/** Assign Taxes (`children`) until the Survey is connected, then what it is doing, plus its Undo toast. */
function MoonConnectionSlot({
  moon,
  children,
}: {
  moon: ReturnType<typeof useManageTaxes>;
  children: ReactNode;
}) {
  return (
    <>
      {moon.connection ? (
        <ConnectedNote
          connection={moon.connection}
          nowMs={moon.now}
          stopId={moon.stopId}
          onStop={moon.stop}
        />
      ) : (
        children
      )}
      <ConnectionToastView toast={moon.toast} onClose={moon.closeToast} />
    </>
  );
}

/** Stable fallback while the live query loads, so `payees` keeps one identity. */
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
  /** The Survey as connected by Assign Taxes; without it the button only opens the Tax tab. */
  connectable?: ConnectableSurvey;
  /**
   * The draft, when the panel holds it, so a template can fill it. Without
   * these the row keeps its own.
   */
  draft?: TaxDraft;
  onDraftChange?: (draft: TaxDraft) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const listId = useId();
  // Starts blank unless this survey already stored a tax: nothing carries over
  // from the last survey, so the pilot sets it for each field they want it on.
  const [own, setOwn] = useState(() => initialTaxDraft(survey?.published));
  const saved = draft ?? own;
  const setSaved = onDraftChange ?? setOwn;
  const payees = useLiveQuery(() => loadPayees(characterId), [characterId]) ?? NO_PAYEES;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Focus is inside the name/rate pair: nothing is stored until it leaves.
  const [focused, setFocused] = useState(false);
  const inFlight = useRef(false);

  const pct = parseTaxPct(saved.pct);
  const name = saved.name.trim();
  const ready = name !== '' && pct !== null;
  const moon = useManageTaxes(
    { characterId, survey: connectable, tax: ready ? { name, pct } : null, updateRate: true },
    () => setFailed(true)
  );

  // Stored on the survey once focus leaves the pair. Best effort: a failed write
  // is not retried until the name or rate changes, and the local line is unaffected.
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
    // Picking a known Payee brings its rate along; typing a new name keeps the rate.
    // Only when the name has just become a known Payee, so a rate typed after is kept.
    const known = findPayeeByName(payees, next);
    const fill = known !== undefined && known !== findPayeeByName(payees, saved.name);
    setSaved({ name: next, pct: fill ? String(known.defaultTaxPct) : saved.pct });
  }

  async function openTax() {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      if (connectable) {
        await moon.connect();
      } else {
        const payee = await ensurePayee(characterId, saved.name, pct);
        await useSurveyPayeeId.getState().setValue(payee.id);
        navigate(MINING_TAX_HREF);
      }
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // Focus moving between the two fields keeps the pair focused; only leaving it stores.
  function leave(event: FocusEvent<HTMLInputElement>) {
    if (!event.currentTarget.closest('[data-tax-fields]')?.contains(event.relatedTarget)) {
      setFocused(false);
    }
  }

  return (
    <InfoRow label={t('survey.moonTax.label')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div data-tax-fields className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex items-center gap-1">
            <TextInput
              size="sm"
              inputMode="decimal"
              aria-label={t('survey.moonTax.rate')}
              className="w-16 tabular-nums"
              value={saved.pct}
              placeholder="0"
              aria-invalid={saved.pct !== '' && pct === null}
              onChange={(event) => setSaved({ ...saved, pct: event.target.value })}
              onFocus={() => setFocused(true)}
              onBlur={leave}
            />
            <span className="text-text-dim">%</span>
          </span>
          <span className="text-text-dim">{t('survey.moonTax.to')}</span>
          <TextInput
            size="sm"
            list={listId}
            aria-label={t('survey.moonTax.payee')}
            className="w-56 max-w-full"
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
        </div>
        <MoonConnectionSlot moon={moon}>
          <Button
            id={moon.manageId}
            size="sm"
            className="touch:min-h-11 sm:ml-auto"
            disabled={!ready}
            loading={busy}
            onClick={() => void openTax()}
          >
            {t('survey.moonTax.open')}
          </Button>
        </MoonConnectionSlot>
        {failed && (
          <span role="alert" className="w-full text-xs text-danger">
            {t('survey.moonTax.failed')}
          </span>
        )}
      </div>
    </InfoRow>
  );
}

/**
 * The read-only line, for everyone but the owner (in the app or on the public
 * page): the rate and who gets it, as the owner set them, and Assign Taxes.
 * Logged out it is disabled with "Log in to access" right under it, like Set
 * waypoint. Logged in, one click connects the Survey's moon to that Payee
 * (`useSurveyConnection`): a Payee of the viewer's by that name (any case) is
 * used as is, keeping the viewer's own default rate; without one it is added
 * at the owner's rate, with Undo. Without the Survey to connect it only opens
 * the Tax tab.
 */
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
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const hintId = useId();
  const loggedOut = characterId === null;
  const moon = useManageTaxes(
    { characterId, survey: connectable, tax: { name: tax.name, pct: tax.pct }, updateRate: false },
    () => setFailed(true)
  );

  async function open() {
    if (characterId === null || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      if (connectable) {
        await moon.connect();
      } else {
        const known = findPayeeByName(await loadPayees(characterId), tax.name);
        if (known) await useSurveyPayeeId.getState().setValue(known.id);
        navigate(MINING_TAX_HREF);
      }
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <InfoRow label={t('survey.moonTax.label')}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xl font-semibold">
          <span className="tabular-nums">{tax.pct}%</span>
          <span className="font-normal text-text-dim">{t('survey.moonTax.to')}</span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{tax.name}</span>
        </p>
        <MoonConnectionSlot moon={moon}>
          <div className={blockedButtonClassName}>
            <Button
              id={moon.manageId}
              size="sm"
              className="touch:min-h-11"
              // Stays focusable with its reason linked, rather than the native attribute (DESIGN §6c Disabled).
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
        {failed && (
          <span role="alert" className="w-full text-xs text-danger">
            {t('survey.moonTax.failed')}
          </span>
        )}
      </div>
    </InfoRow>
  );
}
