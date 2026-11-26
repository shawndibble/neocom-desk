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
import { useSurveyPayeeId } from '@/features/miningTax/surveyPayeePref';
import {
  autoAssignFromSurveys,
  refreshSurveyConnection,
  removeSurveyConnection,
  restoreSurveyConnections,
  startSurveyConnection,
  surveyMoonOreTypeIds,
  useSurveyConnections,
} from '@/features/miningTax/surveyConnections';
import { resolvePlaceSystemId } from '@/features/route/placeSystem';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { ensurePayee, findOrCreatePayee, samePayeeName } from './moonTaxPayee';

export const AUTO_ASSIGN_EVERY_MS = 5 * 60 * 1000;

export interface ConnectableSurvey {
  id: string;
  expiresAt: number;
  locationId: number | null;
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
  tax: SurveyTax | null;
  updateRate: boolean;
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
  const connection =
    stored !== undefined &&
    tax !== null &&
    isConnectionLive(stored, now) &&
    samePayeeName(stored.payeeName, tax.name) &&
    stored.taxPct === tax.pct
      ? stored
      : null;

  function undoWith(steps: () => Promise<unknown>) {
    return () => {
      setToast(null);
      void steps().catch(() => failedRef.current());
    };
  }

  const span =
    survey && connection
      ? connectionWindow({ ...survey.summary, expiresAt: survey.expiresAt }, connection.connectedAt)
      : null;
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
      if (changed) await refreshSurveyConnection(next);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, span?.untilMs, span?.fromDate, oreKey, locationId, structureLabel]);

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
          const created = made.filter((a) => a.payeeId === payeeId);
          if (cancelled || created.length === 0) return;
          setToast({
            message: t('survey.moonTax.assigned', { count: created.length, name: payeeName }),
            onUndo: undoWith(() => unassign(created)),
          });
        })
        .catch(() => undefined);
    };
    run();
    const id = setInterval(run, AUTO_ASSIGN_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [live, payeeId, payeeName, t]);

  async function connect(): Promise<void> {
    if (characterId === null || survey === undefined || tax === null) return;
    const found = await findOrCreatePayee(characterId, tax.name, tax.pct);
    const known = found.created ? undefined : found.payee;
    const payee =
      updateRate && known !== undefined && known.defaultTaxPct !== tax.pct
        ? await ensurePayee(characterId, known.name, tax.pct)
        : found.payee;
    await useSurveyPayeeId.getState().setValue(payee.id);
    const [typeIds, systemId] = await Promise.all([
      surveyMoonOreTypeIds(survey.summary.oreNames),
      systemOf(survey.locationId, characterId),
    ]);
    const structureLabel = structureFromLocation(survey.locationName);
    const connectedAt = Date.now();
    const started: SurveyConnection = {
      surveyId: survey.id,
      characterId,
      payeeId: payee.id,
      payeeName: payee.name,
      taxPct: tax.pct,
      systemId,
      ...(structureLabel ? { structureLabel } : {}),
      typeIds,
      ...connectionWindow({ ...survey.summary, expiresAt: survey.expiresAt }, connectedAt),
      expiresAt: survey.expiresAt,
      connectedAt,
    };
    const replaced = await startSurveyConnection(started);
    setNow(connectedAt);
    const created = await autoAssignFromSurveys().catch((): MiningTaxAssignmentRecord[] => []);

    const parts = [
      known === undefined ? t('survey.moonTax.addedPayee', { name: payee.name, pct: tax.pct }) : '',
      created.length > 0
        ? t('survey.moonTax.assigned', { count: created.length, name: payee.name })
        : t('survey.moonTax.willAssign', { name: payee.name, pct: tax.pct }),
    ];
    setToast({
      message: parts.filter((p) => p !== '').join(' '),
      onUndo: undoWith(async () => {
        const assigned =
          known === undefined
            ? await db.miningTaxAssignments.filter((a) => a.payeeId === payee.id).toArray()
            : created;
        if (assigned.length > 0) {
          const undone = await unassign(assigned);
          if (!undone.ok) throw undone.cause;
        }
        await restoreSurveyConnections(replaced, started);
        if (known === undefined) {
          const removed = await deletePayee(payee);
          if (!removed.ok) throw removed.cause;
        } else if (known.defaultTaxPct !== payee.defaultTaxPct) {
          await ensurePayee(characterId, known.name, known.defaultTaxPct);
        }
      }),
    });
  }

  async function stop(): Promise<void> {
    if (connection === null) return;
    await removeSurveyConnection(connection.surveyId, connection.characterId);
  }

  return { connection, now, connect, stop, toast, closeToast: () => setToast(null) };
}
