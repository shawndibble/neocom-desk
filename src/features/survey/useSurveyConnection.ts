/**
 * "Assign Taxes" on a moon Survey, in one click (issue #4684): finds or adds
 * the Payee, connects the Survey's moon to it (`surveyConnections.ts`) and
 * assigns whatever of that moon's ore is already in the Mining Ledger. While
 * the Survey is open and connected it re-reads the ledger on opening and then
 * every few minutes, so ore mined since is assigned too; the Tax tab's own
 * load does the same. Each run that assigns or adds something says so with
 * Undo.
 *
 * The connection follows the Survey as it is scanned: a moving ETA, a
 * location set later, or a new moon ore type are saved onto it.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import {
  connectionWindow,
  isConnectionLive,
  structureFromLocation,
  type SurveyConnection,
} from '@/engine/miningTax/surveyConnection';
import type { SurveySummary } from '@/engine/survey/series';
import { deletePayee, unassign } from '@/features/miningTax/ledgerActions';
import { createPayee, loadPayees } from '@/features/miningTax/payees';
import { useSurveyPayeeId } from '@/features/miningTax/surveyPayeePref';
import {
  autoAssignFromSurveys,
  removeSurveyConnection,
  saveSurveyConnection,
  surveyMoonOreTypeIds,
  useSurveyConnections,
} from '@/features/miningTax/surveyConnections';
import { resolvePlaceSystemId } from '@/features/route/placeSystem';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { ensurePayee, findPayeeByName, samePayeeName } from './moonTaxPayee';

/** How often an open, connected Survey re-reads the ledger. ESI caches it for ten minutes, so oftener finds nothing new. */
export const AUTO_ASSIGN_EVERY_MS = 5 * 60 * 1000;

/** What a Survey page knows that a connection is built from. */
export interface ConnectableSurvey {
  id: string;
  expiresAt: number;
  /** The Survey Location's id; null with no location, or a typed one. */
  locationId: number | null;
  /** The Survey Location's name, where the structure comes from. */
  locationName?: string;
  summary: Pick<
    SurveySummary,
    'firstAt' | 'etaAt' | 'finished' | 'finishedAt' | 'lastAt' | 'oreNames'
  >;
}

export interface SurveyTax {
  name: string;
  pct: number;
}

export interface ConnectionToast {
  message: string;
  onUndo: () => void;
}

async function systemOf(locationId: number | null, characterId: number): Promise<number | null> {
  if (locationId === null) return null;
  return resolvePlaceSystemId(locationId, characterId).catch(() => null);
}

/** The connection without its structure, so one the Survey no longer names is dropped rather than stored as `undefined`. */
function omitStructure(connection: SurveyConnection): SurveyConnection {
  const rest = { ...connection };
  delete rest.structureLabel;
  return rest;
}

const sameIds = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

export function useSurveyConnection({
  characterId,
  survey,
  tax,
  updateRate,
  onFailed,
}: {
  characterId: number | null;
  survey: ConnectableSurvey | undefined;
  /** The Survey's Payee and rate, once both are set. */
  tax: SurveyTax | null;
  /** The owner's click also makes the rate an existing Payee's default; a viewer's keeps their own. */
  updateRate: boolean;
  /** An Undo that could not be saved. */
  onFailed: () => void;
}) {
  const { t } = useTranslation();
  useHydratedStore(useSurveyConnections);
  const all = useSurveyConnections((s) => s.value);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<ConnectionToast | null>(null);
  const failedRef = useRef(onFailed);
  useEffect(() => {
    failedRef.current = onFailed;
  });

  const stored =
    survey !== undefined && characterId !== null
      ? all.find((c) => c.surveyId === survey.id && c.characterId === characterId)
      : undefined;
  // Shown as connected only while it is live and still names the Survey's
  // current Payee and rate: an owner who changes either connects again.
  const connection =
    stored !== undefined &&
    tax !== null &&
    isConnectionLive(stored, now) &&
    samePayeeName(stored.payeeName, tax.name) &&
    stored.taxPct === tax.pct
      ? stored
      : null;

  /** An Undo's writes, reporting a failure rather than leaving half of it done silently. */
  function undoWith(steps: () => Promise<unknown>) {
    return () => {
      setToast(null);
      void steps().catch(() => failedRef.current());
    };
  }

  // Follow the Survey: a moving ETA, a location set later, a new moon ore.
  const span = survey ? connectionWindow({ ...survey.summary, expiresAt: survey.expiresAt }) : null;
  const oreKey = survey?.summary.oreNames.join('\n') ?? '';
  const locationId = survey?.locationId ?? null;
  const structureLabel = structureFromLocation(survey?.locationName);
  useEffect(() => {
    if (connection === null || span === null) return;
    let cancelled = false;
    void (async () => {
      const [typeIds, systemId] = await Promise.all([
        surveyMoonOreTypeIds(oreKey.split('\n')),
        systemOf(locationId, connection.characterId),
      ]);
      if (cancelled) return;
      const next: SurveyConnection = {
        ...omitStructure(connection),
        ...span,
        typeIds,
        systemId,
        ...(structureLabel ? { structureLabel } : {}),
      };
      const changed =
        next.untilMs !== connection.untilMs ||
        next.fromDate !== connection.fromDate ||
        next.systemId !== connection.systemId ||
        next.structureLabel !== connection.structureLabel ||
        !sameIds(next.typeIds, connection.typeIds);
      if (changed) await saveSurveyConnection(next);
    })().catch(() => undefined); // Kept as it was; the next change or reopen tries again.
    return () => {
      cancelled = true;
    };
    // `span` is read through its two fields, so a new object each render doesn't re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, span?.untilMs, span?.fromDate, oreKey, locationId, structureLabel]);

  // While connected and open: ore mined since keeps being assigned, from opening on.
  const live = connection !== null;
  const payeeId = connection?.payeeId ?? '';
  const payeeName = connection?.payeeName ?? '';
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const run = () => {
      setNow(Date.now());
      void autoAssignFromSurveys()
        .then((made) => {
          // Only this Survey's Payee: another connected Survey's ore isn't this page's to undo.
          const created = made.filter((a) => a.payeeId === payeeId);
          if (cancelled || created.length === 0) return;
          setToast({
            message: t('survey.moonTax.assigned', { count: created.length, name: payeeName }),
            onUndo: undoWith(() => unassign(created)),
          });
        })
        .catch(() => undefined); // The next run, or the Tax tab's load, tries again.
    };
    run();
    const id = setInterval(run, AUTO_ASSIGN_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [live, payeeId, payeeName, t]);

  /** Adds the Payee if need be, connects the moon and assigns what is already mined. Rejects when nothing could be saved. */
  async function connect(): Promise<void> {
    if (characterId === null || survey === undefined || tax === null) return;
    const known = findPayeeByName(await loadPayees(characterId), tax.name);
    const payee = updateRate
      ? await ensurePayee(characterId, tax.name, tax.pct)
      : (known ??
        (await createPayee(characterId, { name: tax.name.trim(), defaultTaxPct: tax.pct })));
    // Still the Assign dialog's suggestion for ore this connection can't place.
    await useSurveyPayeeId.getState().setValue(payee.id);
    const [typeIds, systemId] = await Promise.all([
      surveyMoonOreTypeIds(survey.summary.oreNames),
      systemOf(survey.locationId, characterId),
    ]);
    const structureLabel = structureFromLocation(survey.locationName);
    const connectedAt = Date.now();
    await saveSurveyConnection({
      surveyId: survey.id,
      characterId,
      payeeId: payee.id,
      payeeName: payee.name,
      taxPct: tax.pct,
      systemId,
      ...(structureLabel ? { structureLabel } : {}),
      typeIds,
      ...connectionWindow({ ...survey.summary, expiresAt: survey.expiresAt }),
      expiresAt: survey.expiresAt,
      connectedAt,
    });
    setNow(connectedAt);
    const created = await autoAssignFromSurveys().catch((): MiningTaxAssignmentRecord[] => []);

    const parts = [
      known === undefined ? t('survey.moonTax.addedPayee', { name: payee.name, pct: tax.pct }) : '',
      created.length > 0
        ? t('survey.moonTax.assigned', { count: created.length, name: payee.name })
        : t('survey.moonTax.willAssign', { name: payee.name, pct: tax.pct }),
    ];
    const surveyId = survey.id;
    setToast({
      message: parts.filter((p) => p !== '').join(' '),
      onUndo: undoWith(async () => {
        // A Payee this click added goes with everything assigned to it since,
        // including what the open Survey assigned after the click.
        const assigned =
          known === undefined
            ? await db.miningTaxAssignments.filter((a) => a.payeeId === payee.id).toArray()
            : created;
        if (assigned.length > 0) {
          const undone = await unassign(assigned);
          if (!undone.ok) throw undone.cause;
        }
        await removeSurveyConnection(surveyId, characterId);
        if (known === undefined) {
          const removed = await deletePayee(payee);
          if (!removed.ok) throw removed.cause;
        } else if (known.defaultTaxPct !== payee.defaultTaxPct) {
          // The owner's click made the rate this Payee's default; Undo puts the old one back.
          await ensurePayee(characterId, known.name, known.defaultTaxPct);
        }
      }),
    });
  }

  /** Disconnects the moon. Rejects when that could not be saved. */
  async function stop(): Promise<void> {
    if (connection === null) return;
    await removeSurveyConnection(connection.surveyId, connection.characterId);
  }

  return { connection, now, connect, stop, toast, closeToast: () => setToast(null) };
}
