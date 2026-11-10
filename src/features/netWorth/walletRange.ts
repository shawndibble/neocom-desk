/**
 * Device-local: how many days the Wallet's Balance tab shows, for the Worth
 * chart and ISK flow alike (one page setting, picked in the page header).
 * Every range slices data already loaded, so none costs more than another.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const WALLET_RANGES = ['7', '30', '90'] as const;
export type WalletRange = (typeof WALLET_RANGES)[number];

export const useWalletRange = createLocalSetting<WalletRange>({
  key: 'walletRange',
  defaultValue: '30',
  parse: (raw) => (WALLET_RANGES.includes(raw as WalletRange) ? (raw as WalletRange) : null),
});
