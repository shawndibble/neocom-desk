/**
 * Corp money builders: Corp wallet, Cash flow and Income by source.
 * Same contract as `models.ts`: pure, derived at render time.
 */
import { blank, statusOf, type Builder } from './builderKit';

// TODO(corp-grid): replace each stub with its real builder.
export const corpWallet: Builder = (feeds) => blank('/corp/wallet', statusOf(feeds.corpWallet));
export const corpCashFlow: Builder = (feeds) => blank('/corp/wallet', statusOf(feeds.corpWallet));
export const corpIncome: Builder = (feeds) => blank('/corp/wallet', statusOf(feeds.corpWallet));
