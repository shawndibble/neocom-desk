/**
 * Corp people and mining builders: Members, Inactive members and Moon mining
 * ledger. Same contract as `models.ts`: pure, derived at render time.
 */
import { blank, statusOf, type Builder } from './builderKit';

// TODO(corp-grid): replace each stub with its real builder.
export const corpMembers: Builder = (feeds) => blank('/corp/members', statusOf(feeds.corpMembers));
export const corpInactive: Builder = (feeds) => blank('/corp/members', statusOf(feeds.corpMembers));
export const corpMining: Builder = (feeds) => blank('/corp/moons', statusOf(feeds.corpMining));
