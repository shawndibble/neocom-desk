/**
 * Renderer for EVE's own notifications (issue #274), kept separate from
 * `foregroundPoller.ts`'s `notificationText` if-chain because this one is
 * keyed by ESI's raw `type` string rather than a `NotificationEventId`.
 * Every `type` reaching this module is already a member of the closed
 * Notification Allow-List (`EVE_ALLOWED_TYPES`, `eventSelection.ts`) —
 * `foregroundPoller.ts` drops anything else before it gets here, so
 * `TYPE_RENDERERS` below has an entry for every type this function will ever
 * see in production.
 *
 * Each entry gives the corp-critical handful a real body: the structure
 * under attack, the bill's amount and due date, the war's aggressor, the
 * applicant.
 *
 * **The generic body is still a floor.** Every route through this module ends
 * at `genericText`: a payload missing the field a body needs, a payload the
 * parser could make nothing of, a missing i18n key, and — via the `try`
 * around the whole dispatch — anything that throws on the way, including a
 * `type` this catalog has no renderer for. A renderer that threw or returned
 * nothing would drop the notification entirely, because the delivery loop's
 * caller treats a throw as "drop this notification".
 *
 * **Rendering stays synchronous.** Name lookups happen in
 * `eveNotificationNames.ts` and arrive here already resolved (or absent), so a
 * name that has not resolved renders as an id or a neutral phrase instead of
 * delaying or dropping the notification.
 */
import i18n from '@/i18n';
import type { EveNotificationFire } from '@/engine/notificationDiffs';
import {
  parseEveNotificationPayload,
  reinforcementExitMs,
  type EveNotificationPayload,
} from '@/engine/eveNotificationPayload';
import { formatIsk } from '@/lib/isk';
import { formatLocalDate, formatLocalDateTime } from '@/lib/localDate';

/** Deliberately not `CharacterRef` — importing it back from `foregroundPoller.ts` would be a cycle. */
export interface EveNotificationTextCharacter {
  name: string;
}

/**
 * Names `eveNotificationNames.ts` managed to resolve for this fire. Every
 * member is optional and an empty object is a valid, expected value: ESI can
 * be offline, a structure can be outside the character's ACL, and neither is a
 * reason to withhold the notification.
 */
export interface EveNotificationNames {
  /** The payload's `structureID`, resolved through the app's structure lookup. */
  structure?: string;
  /** Character/corporation/alliance names by id, from the bulk name lookup. */
  entities?: ReadonlyMap<number, string>;
}

const BASE = 'notifications.fired.eveNotification';

interface RenderContext {
  fire: EveNotificationFire;
  payload: EveNotificationPayload;
  names: EveNotificationNames;
}

/** A chosen body sub-key plus its interpolation values, or `null` to fall back to the generic body. */
type BodyChoice = { key: string; vars: Record<string, unknown> } | null;

function genericText(
  fire: EveNotificationFire,
  character: EveNotificationTextCharacter
): { title: string; body: string } {
  return {
    title: i18n.t(`${BASE}.title`),
    body: i18n.t(`${BASE}.body`, { character: character.name, type: fire.type }),
  };
}

/**
 * How the structure is named, best available first: the name CCP wrote into
 * the payload (correct as of the moment the event happened), then the name the
 * app resolved from ESI, then a neutral `structure #<id>` — never nothing,
 * because a body that says "is under attack" with no subject is worse than the
 * generic one.
 */
function structureLabel({ payload, names }: RenderContext): string | null {
  if (payload.structureName !== undefined) return payload.structureName;
  if (names.structure !== undefined) return names.structure;
  if (payload.structureId !== undefined)
    return i18n.t(`${BASE}.structureById`, { id: payload.structureId });
  return null;
}

/** A resolved entity name, or `#<id>` when the bulk lookup did not return one. */
function entityLabel(id: number, names: EveNotificationNames): string {
  return names.entities?.get(id) ?? i18n.t(`${BASE}.entityById`, { id });
}

/** When the reinforcement timer runs out (round 36's rule, `eveNotificationPayload.ts`). */
function timerEnd({ fire, payload }: RenderContext): string | null {
  const exitMs = reinforcementExitMs(fire.timestamp, payload);
  return exitMs === undefined ? null : formatLocalDateTime(new Date(exitMs));
}

/** `planet #<id>`, or `null` when the payload carries no `planetID` at all. */
function planetLabel(payload: EveNotificationPayload): string | null {
  if (payload.planetId === undefined) return null;
  return i18n.t(`${BASE}.planetById`, { id: payload.planetId });
}

/**
 * The most specific attacker id an Orbital payload names, preferring the
 * pilot over their corp over their alliance. CCP does not spell any of these
 * names out here the way `StructureUnderAttack` gets `corpName`/`allianceName`
 * for free, so whichever id is picked still needs a lookup.
 */
export function orbitalAggressorId(payload: EveNotificationPayload): number | undefined {
  return payload.aggressorId ?? payload.aggressorCorpId ?? payload.aggressorAllianceId;
}

/** `OrbitalReinforced`'s exit time is an absolute instant already, unlike `timeLeft`'s duration. */
function reinforceExitEnd(payload: EveNotificationPayload): string | null {
  if (payload.reinforceExitMs === undefined) return null;
  return formatLocalDateTime(new Date(payload.reinforceExitMs));
}

/** Body for a type whose whole payload contribution is "which structure". */
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
  return ({ payload, names }: RenderContext): BodyChoice => {
    if (payload.declaredById === undefined) return null;
    const aggressor = entityLabel(payload.declaredById, names);
    if (withHq && payload.warHqName !== undefined) {
      return { key: 'bodyWithHq', vars: { aggressor, warHq: payload.warHqName } };
    }
    return { key: 'body', vars: { aggressor } };
  };
}

/** Types whose body carries no payload field at all, so nothing can make them fall back. */
function fixedBody(): BodyChoice {
  return { key: 'body', vars: {} };
}

/**
 * `StructuresJobsPaused`/`StructuresJobsCancelled`: CCP publishes no payload
 * schema for either, so this reads `structureID` opportunistically (the one
 * field every other structure-flavoured type carries) and says the plain
 * thing when it is absent, rather than guessing at a job or reagent id with
 * no evidence — the same posture as `CorpOfficeExpirationMsg` above.
 */
function structureChange(ctx: RenderContext): BodyChoice {
  const structure = structureLabel(ctx);
  return structure === null
    ? { key: 'body', vars: {} }
    : { key: 'bodyWithStructure', vars: { structure } };
}

/**
 * One entry per type on the closed Notification Allow-List
 * (`EVE_ALLOWED_TYPES`, `eventSelection.ts`) — the two lists are kept in
 * lockstep deliberately, enforced by an invariant test. A payload this
 * renderer can't make a body from still falls back to `genericText`, but a
 * `type` outside the allow-list can no longer reach here at all:
 * `foregroundPoller.ts` drops it first.
 */
const TYPE_RENDERERS: Readonly<Record<string, (ctx: RenderContext) => BodyChoice>> = {
  StructureUnderAttack: (ctx) => {
    const structure = structureLabel(ctx);
    if (structure === null) return null;
    const { payload, names } = ctx;
    // CCP spells the aggressor's corporation and alliance out in the payload,
    // so the common case needs no lookup at all; the pilot id is the last
    // resort because an unresolved one renders as a bare `#id`.
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
  MoonminingExtractionFinished: structureOnly,
  MoonminingAutomaticFracture: structureOnly,
  CorpAllBillMsg: ({ payload }) => {
    const amount = payload.amount === undefined ? undefined : formatIsk(payload.amount);
    const due =
      payload.dueDateMs === undefined ? undefined : formatLocalDate(new Date(payload.dueDateMs));
    if (amount !== undefined && due !== undefined) return { key: 'body', vars: { amount, due } };
    if (due !== undefined) return { key: 'bodyWithoutAmount', vars: { due } };
    if (amount !== undefined) return { key: 'bodyWithoutDue', vars: { amount } };
    return null;
  },
  BillOutOfMoneyMsg: ({ payload }) => {
    // The real payload is `billTypeID` + `dueDate` and carries no amount, so
    // the due date is the one field worth requiring here.
    if (payload.dueDateMs === undefined) return null;
    return { key: 'body', vars: { due: formatLocalDate(new Date(payload.dueDateMs)) } };
  },
  // CCP publishes no payload schema for this type and it appears in no public
  // sample, so this reads `dueDate` opportunistically — the key every other
  // billing type uses — and says the plain thing when it is absent. What it
  // does *not* do is guess at key names it has no evidence for: a wrong expiry
  // date would cost an office, which is exactly what the notification exists
  // to prevent.
  CorpOfficeExpirationMsg: ({ payload }) =>
    payload.dueDateMs === undefined
      ? { key: 'body', vars: {} }
      : { key: 'bodyWithDue', vars: { due: formatLocalDate(new Date(payload.dueDateMs)) } },
  WarDeclared: warDeclared(true),
  AllWarDeclaredMsg: warDeclared(false),
  // Genuinely an empty payload (`{}`): there is no aggressor yet, only the
  // change in status.
  CorpBecameWarEligible: fixedBody,
  CorpAppNewMsg: ({ payload, names }) => {
    if (payload.charId === undefined) return null;
    return { key: 'body', vars: { applicant: entityLabel(payload.charId, names) } };
  },
  StructureDestroyed: structureOnly,
  StructuresJobsPaused: structureChange,
  StructuresJobsCancelled: structureChange,
  StructureLowReagentsAlert: structureOnly,
  StructureNoReagentsAlert: structureOnly,
  OrbitalAttacked: (ctx) => {
    const { payload, names } = ctx;
    const planet = planetLabel(payload);
    if (planet === null) return null;
    const aggressorId = orbitalAggressorId(payload);
    const aggressor = aggressorId === undefined ? undefined : entityLabel(aggressorId, names);
    return aggressor === undefined
      ? { key: 'body', vars: { planet } }
      : { key: 'bodyWithAggressor', vars: { planet, aggressor } };
  },
  OrbitalReinforced: (ctx) => {
    const { payload } = ctx;
    const planet = planetLabel(payload);
    if (planet === null) return null;
    const timer = reinforceExitEnd(payload);
    return timer === null
      ? { key: 'body', vars: { planet } }
      : { key: 'bodyWithTimer', vars: { planet, timer } };
  },
  CorpKicked: ({ payload, names }) => {
    if (payload.corpId === undefined) return null;
    return { key: 'body', vars: { corp: entityLabel(payload.corpId, names) } };
  },
  InfrastructureHubBillAboutToExpire: ({ payload }) => {
    if (payload.dueDateMs === undefined) return null;
    return { key: 'body', vars: { due: formatLocalDate(new Date(payload.dueDateMs)) } };
  },
};

/** The set of `type` strings that get a hand-written body. Exported for tests and for #300's docs. */
export const EVE_NOTIFICATION_RENDERED_TYPES: readonly string[] = Object.keys(TYPE_RENDERERS);

export function eveNotificationText(
  fire: EveNotificationFire,
  character: EveNotificationTextCharacter,
  names: EveNotificationNames = {}
): { title: string; body: string } {
  // A `type` with no entry here folds into the same `choice === null` path as
  // a known type whose payload didn't parse, rather than a separate early
  // return — one fallback path, not two.
  const render = TYPE_RENDERERS[fire.type] ?? (() => null);
  try {
    const choice = render({ fire, payload: parseEveNotificationPayload(fire.text), names });
    if (choice === null) return genericText(fire, character);
    const titleKey = `${BASE}.types.${fire.type}.title`;
    const bodyKey = `${BASE}.types.${fire.type}.${choice.key}`;
    const title = i18n.t(titleKey);
    const body = i18n.t(bodyKey, { character: character.name, ...choice.vars });
    // i18next echoes the key back when a translation is missing. Shipping
    // `notifications.fired...bodyWithTimer` to a notification tray would be
    // worse than the generic sentence, so a typo degrades like any other
    // missing field.
    if (title === titleKey || body === bodyKey) return genericText(fire, character);
    return { title, body };
  } catch {
    // The whole point of #300's constraint: a renderer that throws on an
    // unexpected payload must not cost the user the notification.
    return genericText(fire, character);
  }
}
