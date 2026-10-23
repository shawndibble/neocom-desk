/**
 * How each polled domain's Notification Events read (issue #1249): one copy
 * table per `pollDomains/` domain, carrying its live (poll) wording, its
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

export type { DomainCopy, NoNames } from './pollDomains/copy/shared';
export * from './pollDomains/copy/skillQueue';
export * from './pollDomains/copy/spExtraction';
export * from './pollDomains/copy/cloneJump';
export * from './pollDomains/copy/industryJobs';
export * from './pollDomains/copy/colonies';
export * from './pollDomains/copy/mail';
export * from './pollDomains/copy/calendar';
export * from './pollDomains/copy/contracts';
export * from './pollDomains/copy/wallet';
export * from './pollDomains/copy/marketOrders';
export * from './pollDomains/copy/eveNotifications';
export * from './pollDomains/copy/corp';
export * from './pollDomains/copy/stockTargets';
export * from './pollDomains/copy/communities';
export * from './pollDomains/copy/incursions';
export * from './pollDomains/copy/priceAlerts';
export * from './pollDomains/copy/kills';
export * from './pollDomains/copy/dens';
export * from './pollDomains/copy/skyhooks';
