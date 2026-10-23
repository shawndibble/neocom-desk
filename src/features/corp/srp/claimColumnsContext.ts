import type { TFunction } from 'i18next';
import type { SrpClaim } from '../srpClaimTypes';
import type { SrpClaimNames } from './useSrpClaimNames';

export interface ClaimColumnsContext {
  t: TFunction;
  names: SrpClaimNames;
  /** 'UTC' for EVE time, else the viewer's zone. */
  zone: 'UTC' | undefined;
  selected: readonly number[];
  onToggle: (killmailId: number) => void;
  /** Text typed into a no-amount claim's field, by killmail id. */
  typed: Readonly<Record<number, string>>;
  onType: (killmailId: number, text: string) => void;
  onApprove: (claim: SrpClaim) => void;
  onReject: (claim: SrpClaim) => void;
  onMarkPaid: (claim: SrpClaim) => void;
  onCopy: (claim: SrpClaim) => void;
  copiedId: number | null;
  /** A change is in flight: row actions sit still until it lands. */
  busy: boolean;
}
