/**
 * "Manage Taxes" on a moon Survey, in one click (issue #4684): finds or adds
 * the Payee, connects the Survey's moon to it (`surveyConnections.ts`) and
 * assigns whatever of that moon's ore is already in the Mining Ledger. While
 * the Survey stays open and connected it re-reads the ledger every few
 * minutes, so ore mined since is assigned too; the Tax tab's own load does the
 * same. Each run that assigns or adds something says so with Undo.
 *
 * The connection follows the Survey as it is scanned: a moving ETA, a
 * location set later, or a new moon ore type are saved onto it.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MiningTaxAssignmentRecord } from '@/db';
import {
  connectionWindow,
  isConnectionLive,
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
  useSurveyConnections,
} from '@/features/miningTax/surveyConnections';
import { resolvePlaceSystemId } from '@/features/route/placeSystem';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { loadMoonOreTypeIds, loadTypes } from '@/sde/loadSde';
import { ensurePayee, findPayeeByName } from './moonTaxPayee';

/** How often an open, connected Survey re-reads the ledger. ESI caches it for ten minutes, so oftener finds nothing new. */
export const AUTO_ASSIGN_EVERY_MS = 5 * 60 * 1000;

/** What a Survey page knows that a connection is built from. */
export interface ConnectableSurvey {
  id: string;
  expiresAt: number;
  /** The Survey Location's id; null with no location, or a typed one. */
  locationId: number | null;
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

/** The moon ore type ids among the scanner's ore names (raw names, the ledger's type ids). */
async function moonOreTypeIds(oreNames: readonly string[]): Promise<number[]> {
  const [ids, types] = await Promise.all([loadMoonOreTypeIds(), loadTypes()]);
  const wanted = new Set(oreNames);
  return ids.filter((id) => wanted.has(types[String(id)]?.name ?? '')).sort((a, b) => a - b);
}

async function systemOf(locationId: number | null, characterId: number): Promise<number | null> {
  if (locationId === null) return null;
  return resolvePlaceSystemId(locationId, characterId).catch(() => null);
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const sameIds = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

export function useSurveyConnection({
  characterId,
  survey,
  tax,
  updateRate,
}: {
  characterId: number | null;
  survey: ConnectableSurvey | undefined;
  /** The Survey's Payee and rate, once both are set. */
  tax: SurveyTax | null;
  /** The owner's click also makes the rate an existing Payee's default; a viewer's keeps their own. */
  updateRate: boolean;
}) {
  const { t } = useTranslation();
  useHydratedStore(useSurveyConnections);
  const all = useSurveyConnections((s) => s.value);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<ConnectionToast | null>(null);

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
    sameName(stored.payeeName, tax.name) &&
    stored.taxPct === tax.pct
      ? stored
      : null;

  // Follow the Survey: a moving ETA, a location set later, a new moon ore.
  const span = survey ? connectionWindow({ ...survey.summary, expiresAt: survey.expiresAt }) : null;
  const oreKey = survey?.summary.oreNames.join('\n') ?? '';
  const locationId = survey?.locationId ?? null;
  useEffect(() => {
    if (connection === null || span === null) return;
    let cancelled = false;
    void (async () => {
      const [typeIds, systemId] = await Promise.all([
        moonOreTypeIds(oreKey.split('\n')),
        systemOf(locationId, connection.characterId),
      ]);
      if (cancelled) return;
      const next: SurveyConnection = { ...connection, ...span, typeIds, systemId };
      const changed =
        next.untilMs !== connection.untilMs ||
        next.fromDate !== connection.fromDate ||
        next.systemId !== connection.systemId ||
        !sameIds(next.typeIds, connection.typeIds);
      if (changed) await saveSurveyConnection(next);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `span` is read through its two fields, so a new object each render doesn't re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, span?.untilMs, span?.fromDate, oreKey, locationId]);

  // While connected and open: ore mined since keeps being assigned.
  const live = connection !== null;
  const payeeName = connection?.payeeName ?? '';
  useEffect(() => {
    if (!live) return;
    const run = () => {
      setNow(Date.now());
      void autoAssignFromSurveys()
        .then((created: MiningTaxAssignmentRecord[]) => {
          if (created.length === 0) return;
          setToast({
            message: t('survey.moonTax.assigned', { count: created.length, name: payeeName }),
            onUndo: () => {
              setToast(null);
              void unassign(created);
            },
          });
        })
        .catch(() => undefined);
    };
    const id = setInterval(run, AUTO_ASSIGN_EVERY_MS);
    return () => clearInterval(id);
  }, [live, payeeName, t]);

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
      moonOreTypeIds(survey.summary.oreNames),
      systemOf(survey.locationId, characterId),
    ]);
    const connectedAt = Date.now();
    await saveSurveyConnection({
      surveyId: survey.id,
      characterId,
      payeeId: payee.id,
      payeeName: payee.name,
      taxPct: tax.pct,
      systemId,
      typeIds,
      ...connectionWindow({ ...survey.summary, expiresAt: survey.expiresAt }),
      expiresAt: survey.expiresAt,
      connectedAt,
    });
    setNow(connectedAt);
    const created = await autoAssignFromSurveys().catch(() => []);

    const parts = [
      known === undefined ? t('survey.moonTax.addedPayee', { name: payee.name, pct: tax.pct }) : '',
      created.length > 0
        ? t('survey.moonTax.assigned', { count: created.length, name: payee.name })
        : t('survey.moonTax.willAssign', { name: payee.name, pct: tax.pct }),
    ];
    const surveyId = survey.id;
    setToast({
      message: parts.filter((p) => p !== '').join(' '),
      onUndo: () => {
        setToast(null);
        void (async () => {
          if (created.length > 0) await unassign(created);
          await removeSurveyConnection(surveyId, characterId);
          if (known === undefined) await deletePayee(payee);
        })();
      },
    });
  }

  async function stop(): Promise<void> {
    if (connection === null) return;
    await removeSurveyConnection(connection.surveyId, connection.characterId);
  }

  return { connection, now, connect, stop, toast, closeToast: () => setToast(null) };
}
