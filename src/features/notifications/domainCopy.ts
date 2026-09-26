/**
 * How each polled domain's Notification Events read (issue #1249): one copy
 * table per `pollDomains.ts` domain, carrying its live (poll) wording, its
 * hedged Scheduled Push wording where it projects any, and the row a fire is
 * about for click routing. Each event's Event Entry (`eventEntries.ts`, issue
 * #1285) names the table it reads and, if it projects, the push renderer; the
 * domain supplies the name lookups the copy needs. This module does no lookups, so every
 * renderer here is a plain function of `(fire, characterName, names)` and
 * testable as a table.
 *
 * Two render paths, on purpose:
 *
 * - **`poll`** renders through i18next (`notifications.fired.*`). The
 *   Foreground Poller has genuinely observed what it reports, so this copy
 *   asserts.
 * - **`push`** renders plain English (`renderSharedWording` or inline
 *   template literals): a Projection row is rendered on-device before upload
 *   and the backend holds no i18n catalog (ADR 0010). Each one checks
 *   `assertProjectionWording` first. Three events hedge ("was due to …")
 *   because an in-game action routinely falsifies the prediction before the
 *   push fires — see `engine/projection.ts`'s `projectionWording`.
 *
 * A name that failed to resolve is absent from `names`; each renderer owns
 * its `#id` fallback, so poll and push degrade identically.
 */
import i18n from '@/i18n';
import type {
  NotificationFire,
  SpExtractionFire,
  IndustryJobNotificationFire,
  PlanetaryNotificationFire,
  ExtractorExpiringFire,
  MailNotificationFire,
  NewCalendarEventFire,
  CalendarEventStartingFire,
  ContractNotificationFire,
  WalletNotificationFire,
  MarketOrderNotificationFire,
  MarketOrderUndercutFire,
  EveNotificationFire,
  StructureReinforcementExitFire,
  StructureFuelLowFire,
  CorpIndustryJobNotificationFire,
  CorpMemberJoinedFire,
  CorpMemberLeftFire,
  CorpWalletThresholdFire,
  PriceAlertTriggeredFire,
} from '@/engine/notificationDiffs';
import { renderSharedWording, type NotificationCopy } from '@/engine/notificationWording';
import {
  assertProjectionWording,
  romanLevel,
  type PushCopy,
  type ReinforcementExitNames,
} from '@/engine/projection';
import { formatIsk } from '@/lib/isk';
import { eveNotificationText, type EveNotificationNames } from './eveNotificationText';

/** A domain's copy as `pollDomains.ts` consumes it; `push` is passed to its own `project*`. */
export interface DomainCopy<TFire, TNames> {
  /** Live wording for a fire the Foreground Poller observed. */
  readonly poll: (fire: TFire, characterName: string, names: TNames) => NotificationCopy;
  /**
   * The id of the row this fire was about, for the events whose destination
   * pulses it (`notificationOptions.ts`'s `SUBJECT_URLS` builds the URL).
   */
  readonly subjectOf?: (fire: TFire) => number | undefined;
}

/** Nothing to look up. */
export type NoNames = Record<string, never>;

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function fired(eventId: string, variant: string, vars?: Record<string, unknown>): string {
  return i18n.t(`notifications.fired.${eventId}.${variant}`, vars);
}

/** The shape nearly every event shares: a fixed title, one body. */
function simple(eventId: string, vars: Record<string, unknown>): NotificationCopy {
  return { title: fired(eventId, 'title'), body: fired(eventId, 'body', vars) };
}

/* Skill queue ------------------------------------------------------------- */

export interface SkillNames {
  readonly skill?: string;
}

export const skillQueueCopy: DomainCopy<NotificationFire, SkillNames> & {
  readonly push: PushCopy<NotificationFire, SkillNames>;
} = {
  poll: (fire, character, names) => {
    if (fire.eventId === 'characterNotTraining') {
      return simple('characterNotTraining', { character });
    }
    if (fire.eventId === 'skillQueueEnding') {
      return simple('skillQueueEnding', {
        character,
        skill: names.skill ?? `#${fire.skillId}`,
        hours: Math.round((fire.thresholdMs ?? 0) / HOUR_MS),
      });
    }
    // Live copy drops an out-of-range level; push below prints it as a number.
    const level =
      fire.level !== null && fire.level >= 1 && fire.level <= 5 ? ROMAN[fire.level - 1] : '';
    return simple('skillLevelComplete', {
      character,
      skill: names.skill ?? `#${fire.skillId}`,
      level,
    });
  },
  /**
   * `skillQueueEnding` hedges, unlike its two skill-queue siblings above: an
   * in-game top-up of the queue — the whole activity this warning exists to
   * prompt — routinely falsifies the prediction before the push fires, the
   * same reasoning `colonyCopy`/`structureFuelCopy` document in full
   * (`engine/projection.ts`'s `projectionWording`).
   */
  push: (fire, character, names) => {
    if (fire.eventId === 'characterNotTraining') {
      assertProjectionWording('characterNotTraining', 'assert');
      return renderSharedWording('characterNotTraining', { character });
    }
    if (fire.eventId === 'skillQueueEnding') {
      assertProjectionWording('skillQueueEnding', 'hedge');
      const hours = Math.round((fire.thresholdMs ?? 0) / HOUR_MS);
      return {
        title: 'Skill queue due to run dry',
        body: `${character}'s skill queue was due to run dry in under ${hours} hours.`,
      };
    }
    assertProjectionWording('skillLevelComplete', 'assert');
    return renderSharedWording('skillLevelComplete', {
      character,
      skill: names.skill ?? `#${fire.skillId}`,
      level: fire.level === null ? '' : romanLevel(fire.level),
    });
  },
};

/* SP extraction ----------------------------------------------------------- */

export const spExtractionCopy: DomainCopy<SpExtractionFire, NoNames> = {
  poll: (_fire, character) => simple('spExtractionReady', { character }),
};

/* Industry jobs ----------------------------------------------------------- */

export interface ItemNames {
  readonly item?: string;
}

/** Product where the job has one, else the blueprint itself (copying, research). */
export function industryItemTypeId(fire: {
  productTypeId: number | null;
  blueprintTypeId: number;
}): number {
  return fire.productTypeId ?? fire.blueprintTypeId;
}

export const industryJobCopy: DomainCopy<IndustryJobNotificationFire, ItemNames> & {
  readonly push: PushCopy<IndustryJobNotificationFire, ItemNames>;
} = {
  poll: (fire, character, names) =>
    simple('industryJobComplete', {
      character,
      item: names.item ?? `#${industryItemTypeId(fire)}`,
    }),
  push: (fire, character, names) => {
    assertProjectionWording('industryJobComplete', 'assert');
    return renderSharedWording('industryJobComplete', {
      character,
      item: names.item ?? `#${industryItemTypeId(fire)}`,
    });
  },
  // The job sits in Active Jobs until it is delivered, which is the point.
  subjectOf: (fire) => fire.jobId,
};

/* Planetary colonies ------------------------------------------------------ */

export interface PlanetNames {
  readonly planet?: string;
}

type ColonyFire = PlanetaryNotificationFire | ExtractorExpiringFire;

export const colonyCopy: DomainCopy<ColonyFire, PlanetNames> & {
  readonly push: PushCopy<ColonyFire, PlanetNames>;
} = {
  poll: (fire, character, names) => {
    const planet = names.planet ?? `#${fire.planetId}`;
    if (fire.eventId === 'planetaryExtractionDone') {
      return simple('planetaryExtractionDone', { character, planet });
    }
    return simple('planetaryExtractorExpiring', {
      character,
      planet,
      hours: Math.round(fire.thresholdMs / HOUR_MS),
    });
  },
  /**
   * Hedged, unlike the live path's "has stopped": a pilot who restarted the
   * programs in game before this fired never had an extraction stop at all.
   *
   * The **title** hedges too, which `structureFuelCopy.push` does not. A push
   * is often read as a single line on a lock screen, so the title is the
   * whole claim there — "Extraction done" over a colony still running is the
   * exact sentence this was reported for, and softening only the body leaves
   * the wrong half showing.
   */
  push: (fire, character, names) => {
    const planet = names.planet ?? `#${fire.planetId}`;
    if (fire.eventId === 'planetaryExtractionDone') {
      assertProjectionWording('planetaryExtractionDone', 'hedge');
      return {
        title: 'Extraction due to stop',
        body: `${character}'s extraction on ${planet} was due to stop.`,
      };
    }
    assertProjectionWording('planetaryExtractorExpiring', 'hedge');
    const hours = Math.round(fire.thresholdMs / HOUR_MS);
    return {
      title: 'Extractor due to expire',
      body: `${character}'s extractor on ${planet} was due to expire in under ${hours} hours.`,
    };
  },
};

/* Mail -------------------------------------------------------------------- */

export const mailCopy: DomainCopy<MailNotificationFire, NoNames> = {
  poll: (_fire, character) => simple('newMail', { character }),
};

/* Calendar ---------------------------------------------------------------- */

export interface CalendarNames {
  /**
   * When a newly-added event starts, already formatted in the pilot's chosen
   * clock — a lookup because that clock is a stored preference. Absent when
   * the fire carries no usable instant: the body then drops the clause
   * rather than printing "Invalid Date".
   */
  readonly when?: string;
}

type CalendarFire = NewCalendarEventFire | CalendarEventStartingFire;

export const calendarCopy: DomainCopy<CalendarFire, CalendarNames> & {
  readonly push: PushCopy<CalendarEventStartingFire, NoNames>;
} = {
  poll: (fire, character, names) => {
    if (fire.eventId === 'newCalendarEvent') {
      return {
        title: fired('newCalendarEvent', 'title'),
        body:
          fire.title === undefined || names.when === undefined
            ? fired('newCalendarEvent', 'bodyUnnamed', { character })
            : fired('newCalendarEvent', 'body', { character, event: fire.title, when: names.when }),
      };
    }
    return {
      title: fired('calendarEventStarting', 'title'),
      body:
        fire.title === undefined
          ? fired('calendarEventStarting', 'bodyUnnamed', { character })
          : fired('calendarEventStarting', 'body', { character, event: fire.title }),
    };
  },
  /**
   * Names the event where the snapshot knows it. A baseline persisted before
   * the title was recorded falls back to the unnamed copy rather than pushing
   * a sentence with a hole in it.
   */
  push: (fire, character) => {
    assertProjectionWording('calendarEventStarting', 'assert');
    return fire.title === undefined
      ? renderSharedWording('calendarEventStarting', { character }, 'bodyUnnamed')
      : renderSharedWording('calendarEventStarting', { character, event: fire.title });
  },
};

/* Contracts --------------------------------------------------------------- */

export const contractCopy: DomainCopy<ContractNotificationFire, NoNames> & {
  readonly push: PushCopy<ContractNotificationFire, NoNames>;
} = {
  // Same shape for the three transitions (issue #1091); the lead-time warning names its window (issue #1713).
  poll: (fire, character) =>
    simple(fire.eventId, {
      character,
      hours: Math.round((fire.thresholdMs ?? 0) / HOUR_MS),
    }),
  /**
   * Only `courierDeliveryDue` projects, and it hedges: delivering the haul —
   * the action the warning exists to prompt — falsifies the prediction before
   * the push fires (`engine/projection.ts`'s `projectionWording`).
   */
  push: (fire, character) => {
    assertProjectionWording('courierDeliveryDue', 'hedge');
    const hours = Math.round((fire.thresholdMs ?? 0) / HOUR_MS);
    return {
      title: 'Courier delivery due',
      body: `${character}'s courier contract was due for delivery in under ${hours} hours.`,
    };
  },
  // The contract row. Still listed — the filter defaults to every status.
  subjectOf: (fire) => fire.contractId,
};

/* Wallet ------------------------------------------------------------------ */

export const walletCopy: DomainCopy<WalletNotificationFire, NoNames> = {
  poll: (fire, character) => ({
    title: fired('walletBalanceChanged', 'title'),
    body:
      fire.amount === null
        ? fired('walletBalanceChanged', 'body', { character })
        : fired('walletBalanceChanged', 'bodyWithAmount', {
            character,
            amount: formatIsk(fire.amount, 2),
          }),
  }),
  // The journal line that moved the balance.
  subjectOf: (fire) => fire.journalEntryId,
};

/* Market orders ----------------------------------------------------------- */

export const marketOrderCopy: DomainCopy<MarketOrderNotificationFire, ItemNames> = {
  poll: (fire, character, names) => {
    const item = names.item ?? `#${fire.typeId}`;
    return {
      title: fired('marketOrderFilled', 'title'),
      // "1 x Tritanium" is noise; a bare item name is not.
      body:
        fire.quantity > 1
          ? fired('marketOrderFilled', 'bodyWithQuantity', {
              character,
              item,
              quantity: fire.quantity.toLocaleString(),
            })
          : fired('marketOrderFilled', 'body', { character, item }),
    };
  },
  // The fill itself — what sold, how many, to whom. ESI's transactions carry
  // no order id, so the panel resolves the item to its newest sell; every
  // other subject is an exact row id.
  subjectOf: (fire) => fire.typeId,
};

/* Market order undercut ------------------------------------------------------ */

export const marketOrderUndercutCopy: DomainCopy<MarketOrderUndercutFire, ItemNames> = {
  poll: (fire, character, names) => {
    const item = names.item ?? `#${fire.typeId}`;
    const vars = {
      character,
      item,
      price: formatIsk(fire.price, 2),
      rival: formatIsk(fire.rivalPrice, 2),
    };
    return {
      title: fired('marketOrderUndercut', 'title'),
      body: fired('marketOrderUndercut', fire.isBuyOrder ? 'buyBody' : 'sellBody', vars),
    };
  },
  // The beaten order's own row on Market Orders (`notificationOptions.ts`'s
  // `highlightRow`).
  subjectOf: (fire) => fire.orderId,
};

/* EVE notifications ------------------------------------------------------- */

/**
 * Best structure label available, in the same preference order as
 * `eveNotificationText.ts`'s `structureLabel` — never nothing, since "exits
 * reinforcement soon" with no subject is worse than a generic body.
 */
function reinforcementExitLabel(names: ReinforcementExitNames): string {
  if (names.payloadStructureName !== undefined) return names.payloadStructureName;
  if (names.resolvedStructureName !== undefined) return names.resolvedStructureName;
  if (names.structureId !== undefined) return `structure #${names.structureId}`;
  return 'a structure';
}

export const eveNotificationCopy: DomainCopy<EveNotificationFire, EveNotificationNames> & {
  readonly push: PushCopy<StructureReinforcementExitFire, ReinforcementExitNames>;
} = {
  poll: (fire, character, names) => eveNotificationText(fire, { name: character }, names),
  push: (_fire, character, names) => {
    assertProjectionWording('eveNotification', 'assert');
    return {
      title: 'Structure coming out of reinforcement',
      body: `${character}: ${reinforcementExitLabel(names)} exits reinforcement soon.`,
    };
  },
};

/* Structure fuel ---------------------------------------------------------- */

export const structureFuelCopy: DomainCopy<StructureFuelLowFire, NoNames> & {
  readonly push: PushCopy<StructureFuelLowFire, NoNames>;
} = {
  poll: (fire, character) =>
    simple('structureFuelLow', {
      character,
      structure: fire.structureName,
      days: Math.round(fire.thresholdMs / DAY_MS),
    }),
  /**
   * Hedged for the planetary events' reason: "was due to run out" rather than
   * "is low", because a refuel performed in game while the app is closed
   * makes the assertive phrasing plainly wrong and nothing re-checks before
   * the push goes out.
   *
   * Its title stays assertive where theirs do not — "Structure fuel low" is a
   * standing condition a refuel resolves, not a moment this push claims to
   * have witnessed, so it reads as stale rather than false.
   */
  push: (fire, character) => {
    assertProjectionWording('structureFuelLow', 'hedge');
    return {
      title: 'Structure fuel low',
      body: `${character}: ${fire.structureName} was due to run out of fuel.`,
    };
  },
};

/* Corp industry jobs ------------------------------------------------------ */

export const corpIndustryJobCopy: DomainCopy<CorpIndustryJobNotificationFire, ItemNames> = {
  poll: (fire, character, names) =>
    simple('corpIndustryJobReady', {
      character,
      item: names.item ?? `#${industryItemTypeId(fire)}`,
    }),
};

/* Corp roster ------------------------------------------------------------- */

export interface MemberNames {
  readonly member?: string;
}

export const corpRosterCopy: DomainCopy<CorpMemberJoinedFire | CorpMemberLeftFire, MemberNames> = {
  poll: (fire, character, names) =>
    simple(fire.eventId, {
      character,
      member: names.member ?? `#${fire.memberCharacterId}`,
    }),
  // The new member's roster row. Not `corpMemberLeft`: that member is gone
  // from the roster, so a highlight would name a row that is not there.
  subjectOf: (fire) => (fire.eventId === 'corpMemberJoined' ? fire.memberCharacterId : undefined),
};

/* Corp wallet ------------------------------------------------------------- */

export const corpWalletCopy: DomainCopy<CorpWalletThresholdFire, NoNames> = {
  poll: (fire, character) => ({
    title: fired('corpWalletThreshold', 'title'),
    body:
      fire.kind === 'balanceBelow'
        ? fired('corpWalletThreshold', 'balanceBelowBody', {
            character,
            division: fire.division,
            balance: formatIsk(fire.balance, 2),
          })
        : fired('corpWalletThreshold', 'transactionAboveBody', {
            character,
            division: fire.division,
            amount: formatIsk(Math.abs(fire.amount), 2),
          }),
  }),
};

/* Price alerts ------------------------------------------------------------ */

export const priceAlertCopy: DomainCopy<PriceAlertTriggeredFire, NoNames> = {
  // The only event with no Character in its copy: an alert is per item, not per pilot.
  poll: (fire) => ({
    title: fired('priceAlertTriggered', 'title'),
    body: fired('priceAlertTriggered', `${fire.direction}Body`, {
      item: fire.name,
      price: formatIsk(fire.price, 2),
      target: formatIsk(fire.targetPrice, 2),
    }),
  }),
  // The item itself, selected via Market Browser's own `?type=` param.
  subjectOf: (fire) => fire.typeId,
};
