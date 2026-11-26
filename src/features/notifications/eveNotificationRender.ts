import type { Translate } from '@/lib/translate';
import type { EveNotificationFire } from '@/engine/notificationDiffs';
import {
  parseEveNotificationPayload,
  reinforcementExitMs,
  type EveNotificationPayload,
} from '@/engine/eveNotificationPayload';
import { formatIsk } from '@/lib/isk';
import { formatLocalDate, formatLocalDateTime } from '@/lib/localDate';
import { eveTypeLabel } from './eveTypeLabel';

export type EveNotificationTranslate = Translate;

export interface EveNotificationTextCharacter {
  name: string;
}

export interface EveNotificationNames {
  structure?: string;
  entities?: ReadonlyMap<number, string>;
}

const BASE = 'notifications.fired.eveNotification';

interface RenderContext {
  t: EveNotificationTranslate;
  fire: EveNotificationFire;
  payload: EveNotificationPayload;
  names: EveNotificationNames;
  timeZone: string | undefined;
}

type BodyChoice = { key: string; vars: Record<string, unknown> } | null;

function genericText(
  t: EveNotificationTranslate,
  fire: EveNotificationFire,
  character: EveNotificationTextCharacter
): { title: string; body: string } {
  const typeName = eveTypeLabel(t, fire.type);
  return {
    title: t(`${BASE}.title`),
    body: t(`${BASE}.body`, { character: character.name, typeName }),
  };
}

function structureLabel({ t, payload, names }: RenderContext): string | null {
  if (payload.structureName !== undefined) return payload.structureName;
  if (names.structure !== undefined) return names.structure;
  if (payload.structureId !== undefined)
    return t(`${BASE}.structureById`, { id: payload.structureId });
  return null;
}

function entityLabel(t: EveNotificationTranslate, id: number, names: EveNotificationNames): string {
  return names.entities?.get(id) ?? t(`${BASE}.entityById`, { id });
}

function timerEnd({ fire, payload, timeZone }: RenderContext): string | null {
  const exitMs = reinforcementExitMs(fire.timestamp, payload);
  return exitMs === undefined ? null : formatLocalDateTime(new Date(exitMs), timeZone);
}

function planetLabel(t: EveNotificationTranslate, payload: EveNotificationPayload): string | null {
  if (payload.planetId === undefined) return null;
  return t(`${BASE}.planetById`, { id: payload.planetId });
}

export function orbitalAggressorId(payload: EveNotificationPayload): number | undefined {
  return payload.aggressorId ?? payload.aggressorCorpId ?? payload.aggressorAllianceId;
}

function reinforceExitEnd(
  payload: EveNotificationPayload,
  timeZone: string | undefined
): string | null {
  if (payload.reinforceExitMs === undefined) return null;
  return formatLocalDateTime(new Date(payload.reinforceExitMs), timeZone);
}

function structureOnly(ctx: RenderContext): BodyChoice {
  const structure = structureLabel(ctx);
  return structure === null ? null : { key: 'body', vars: { structure } };
}

function reinforced(ctx: RenderContext): BodyChoice {
  const structure = structureLabel(ctx);
  if (structure === null) return null;
  const timer = timerEnd(ctx);
  return timer === null
    ? { key: 'body', vars: { structure } }
    : { key: 'bodyWithTimer', vars: { structure, timer } };
}

function warDeclared(withHq: boolean) {
  return ({ t, payload, names }: RenderContext): BodyChoice => {
    if (payload.declaredById === undefined) return null;
    const aggressor = entityLabel(t, payload.declaredById, names);
    if (withHq && payload.warHqName !== undefined) {
      return { key: 'bodyWithHq', vars: { aggressor, warHq: payload.warHqName } };
    }
    return { key: 'body', vars: { aggressor } };
  };
}

function fixedBody(): BodyChoice {
  return { key: 'body', vars: {} };
}

function structureChange(ctx: RenderContext): BodyChoice {
  const structure = structureLabel(ctx);
  return structure === null
    ? { key: 'body', vars: {} }
    : { key: 'bodyWithStructure', vars: { structure } };
}

const TYPE_RENDERERS: Readonly<Record<string, (ctx: RenderContext) => BodyChoice>> = {
  StructureUnderAttack: (ctx) => {
    const structure = structureLabel(ctx);
    if (structure === null) return null;
    const { payload, names } = ctx;
    const aggressor =
      payload.corpName ??
      payload.allianceName ??
      (payload.charId === undefined ? undefined : names.entities?.get(payload.charId));
    return aggressor === undefined
      ? { key: 'body', vars: { structure } }
      : { key: 'bodyWithAggressor', vars: { structure, aggressor } };
  },
  StructureLostShields: reinforced,
  StructureLostArmor: reinforced,
  StructureFuelAlert: structureOnly,
  StructureWentLowPower: structureOnly,
  StructureWentHighPower: structureOnly,
  StructureServicesOffline: structureOnly,
  StructureImpendingAbandonmentAssetsAtRisk: (ctx) => {
    const structure = structureLabel(ctx);
    if (structure === null) return null;
    const days = ctx.payload.daysUntilAbandon;
    return days === undefined
      ? { key: 'body', vars: { structure } }
      : { key: 'bodyWithDays', vars: { structure, count: days } };
  },
  MoonminingExtractionStarted: (ctx) => {
    const structure = structureLabel(ctx);
    if (structure === null) return null;
    const ready = ctx.payload.readyTimeMs;
    return ready === undefined
      ? { key: 'body', vars: { structure } }
      : {
          key: 'bodyWithReady',
          vars: { structure, ready: formatLocalDateTime(new Date(ready), ctx.timeZone) },
        };
  },
  MoonminingExtractionFinished: structureOnly,
  MoonminingLaserFired: structureOnly,
  MoonminingAutomaticFracture: structureOnly,
  MoonminingExtractionCancelled: structureOnly,
  CorpAllBillMsg: ({ payload, timeZone }) => {
    const amount = payload.amount === undefined ? undefined : formatIsk(payload.amount);
    const due =
      payload.dueDateMs === undefined
        ? undefined
        : formatLocalDate(new Date(payload.dueDateMs), timeZone);
    if (amount !== undefined && due !== undefined) return { key: 'body', vars: { amount, due } };
    if (due !== undefined) return { key: 'bodyWithoutAmount', vars: { due } };
    if (amount !== undefined) return { key: 'bodyWithoutDue', vars: { amount } };
    return null;
  },
  BillOutOfMoneyMsg: ({ payload, timeZone }) => {
    if (payload.dueDateMs === undefined) return null;
    return { key: 'body', vars: { due: formatLocalDate(new Date(payload.dueDateMs), timeZone) } };
  },
  CorpOfficeExpirationMsg: ({ payload, timeZone }) =>
    payload.dueDateMs === undefined
      ? { key: 'body', vars: {} }
      : {
          key: 'bodyWithDue',
          vars: { due: formatLocalDate(new Date(payload.dueDateMs), timeZone) },
        },
  WarDeclared: warDeclared(true),
  AllWarDeclaredMsg: warDeclared(false),
  CorpBecameWarEligible: fixedBody,
  CorpAppNewMsg: ({ t, payload, names }) => {
    if (payload.charId === undefined) return null;
    return { key: 'body', vars: { applicant: entityLabel(t, payload.charId, names) } };
  },
  StructureDestroyed: structureOnly,
  StructuresJobsPaused: structureChange,
  StructuresJobsCancelled: structureChange,
  StructureLowReagentsAlert: structureOnly,
  StructureNoReagentsAlert: structureOnly,
  OrbitalAttacked: (ctx) => {
    const { t, payload, names } = ctx;
    const planet = planetLabel(t, payload);
    if (planet === null) return null;
    const aggressorId = orbitalAggressorId(payload);
    const aggressor = aggressorId === undefined ? undefined : entityLabel(t, aggressorId, names);
    return aggressor === undefined
      ? { key: 'body', vars: { planet } }
      : { key: 'bodyWithAggressor', vars: { planet, aggressor } };
  },
  OrbitalReinforced: (ctx) => {
    const { t, payload, timeZone } = ctx;
    const planet = planetLabel(t, payload);
    if (planet === null) return null;
    const timer = reinforceExitEnd(payload, timeZone);
    return timer === null
      ? { key: 'body', vars: { planet } }
      : { key: 'bodyWithTimer', vars: { planet, timer } };
  },
  CorpKicked: ({ t, payload, names }) => {
    if (payload.corpId === undefined) return null;
    return { key: 'body', vars: { corp: entityLabel(t, payload.corpId, names) } };
  },
  InfrastructureHubBillAboutToExpire: ({ payload, timeZone }) => {
    if (payload.dueDateMs === undefined) return null;
    return { key: 'body', vars: { due: formatLocalDate(new Date(payload.dueDateMs), timeZone) } };
  },
};

export const EVE_NOTIFICATION_RENDERED_TYPES: readonly string[] = Object.keys(TYPE_RENDERERS);

export function renderEveNotification(
  t: EveNotificationTranslate,
  fire: EveNotificationFire,
  character: EveNotificationTextCharacter,
  names: EveNotificationNames = {},
  timeZone?: string
): { title: string; body: string } {
  const render = TYPE_RENDERERS[fire.type] ?? (() => null);
  try {
    const choice = render({
      t,
      fire,
      payload: parseEveNotificationPayload(fire.text),
      names,
      timeZone,
    });
    if (choice === null) return genericText(t, fire, character);
    const titleKey = `${BASE}.types.${fire.type}.title`;
    const bodyKey = `${BASE}.types.${fire.type}.${choice.key}`;
    const title = t(titleKey);
    const body = t(bodyKey, { character: character.name, ...choice.vars });
    if (title === titleKey || body === bodyKey) return genericText(t, fire, character);
    return { title, body };
  } catch {
    return genericText(t, fire, character);
  }
}
