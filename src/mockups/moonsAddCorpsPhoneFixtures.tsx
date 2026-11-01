import type { ReactNode } from 'react';
import { Pill } from '@/components/ui/Pill';

/** Sample Moon owners rows for the phone redesign; all names invented. */
export interface PhoneOwner {
  name: string;
  refineries: number;
  status: 'active' | 'cant-read';
  yours?: boolean;
  /** Short line under the name (sync age or the date the ledger went unreadable). */
  note: string;
  owed?: string;
  mined: string;
  theirRate?: string;
  minerRate: string;
}

/** Worst case for the phone: a long name and an eleven-digit amount owed. */
export const STRESS: PhoneOwner[] = [
  {
    name: 'Brinewater Deep Space Extraction and Hauling Collective',
    refineries: 3,
    status: 'cant-read',
    note: "Can't read their ledger since 11 Oct",
    owed: '48,123,456,789',
    mined: '1.92B',
    theirRate: '8%',
    minerRate: '12%',
  },
  {
    name: 'Ashfall Mining Collective',
    refineries: 2,
    status: 'active',
    note: 'Synced 2h ago',
    owed: '13,024,480',
    mined: '412.8M',
    theirRate: '8%',
    minerRate: '12%',
  },
  {
    name: 'Ironvale Reach Two Holdings of the Outer Ring',
    refineries: 2,
    status: 'active',
    yours: true,
    note: 'Synced 2h ago',
    mined: '412.8M',
    minerRate: '12%',
  },
];

export const OWNERS: PhoneOwner[] = [
  {
    name: 'Ashfall Mining Collective',
    refineries: 2,
    status: 'active',
    note: 'Synced 2h ago',
    owed: '13,024,480',
    mined: '412.8M',
    theirRate: '8%',
    minerRate: '12%',
  },
  {
    name: 'Cinder Reach Holdings',
    refineries: 2,
    status: 'cant-read',
    note: "Can't read their ledger since 11 Oct",
    owed: '6,182,000',
    mined: '96.5M',
    theirRate: '7%',
    minerRate: '11%',
  },
  {
    name: 'Ironvale Reach',
    refineries: 2,
    status: 'active',
    yours: true,
    note: 'Synced 2h ago',
    mined: '412.8M',
    minerRate: '12%',
  },
  {
    name: 'Ashen Harbor Mining',
    refineries: 1,
    status: 'active',
    yours: true,
    note: 'Synced 2h ago',
    mined: '188.1M',
    minerRate: '12%',
  },
];

export interface PhoneAttention {
  name: string;
  pill: ReactNode;
  hint: string;
  action: string;
  danger?: boolean;
  note?: string;
}

export const ATTENTION: PhoneAttention[] = [
  {
    name: 'Sable Ridge Extraction',
    pill: <Pill tone="warning">Needs login</Pill>,
    hint: 'The EVE login did not finish.',
    action: 'Log in again',
  },
  {
    name: 'Emberlight Group',
    pill: <Pill tone="warning">Own book</Pill>,
    hint: 'Delete its book first, then connect it here.',
    action: '',
  },
  {
    name: 'Gantry Point Mining',
    pill: <Pill tone="warning">Needs a role</Pill>,
    hint: 'EVE refused the mining ledger. The character needs the CEO, Director or Accountant role.',
    action: 'Log in again',
  },
  {
    name: 'Wren Hollow Corp',
    pill: <Pill tone="danger">Gone quiet</Pill>,
    hint: 'EVE has not answered for this corp for a while. It may be closed.',
    action: 'Remove',
    danger: true,
    note: 'Removing keeps its past mining and billing records.',
  },
];
