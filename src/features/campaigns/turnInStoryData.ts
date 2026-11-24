/**
 * Sample offers and marks for the turn-in stories (`TurnInDetail.stories.tsx`,
 * `TurnInBreakdown.stories.tsx`): Fractured Skies Item Traders, LP at 800
 * ISK/LP. The marks are `TurnInSampleMark`.
 */
import type { TurnInOfferDetail } from './useTurnIns';

export const FAILOVER: TurnInOfferDetail = {
  objectiveId: 'obj-report',
  campaignId: 'camp-caldari',
  typeId: 97545,
  iskPerItem: 28_000,
  iskPerInterval: 28_000,
  iskInterval: 1,
  lpPerItem: 40,
  lpPerBlock: 4_000,
  lpBlockSize: 100,
  lpCorporationId: 1000035,
  lpValue: 800,
  lpIskPerItem: 32_000,
  totalPerItem: 60_000,
  traderTypeId: 97622,
  traderName: 'Secure Strength Trader',
  systemId: 30045324,
  progress: 1_700_000,
  targetProgress: 10_000_000,
  filled: 0.17,
  remaining: 8_300_000,
  maxPerParticipant: null,
  objectiveTitle: 'Deliver Shield Failover Report in Onnamon',
  campaignTitle: 'Secure Strength',
  factionId: 500001,
  systemName: 'Onnamon',
  lpValueSource: 'market',
};

export const STRATEGIC_INTEL: TurnInOfferDetail = {
  ...FAILOVER,
  objectiveId: 'obj-intel',
  typeId: 97549,
  iskPerItem: 32_000,
  iskPerInterval: 32_000,
  lpPerItem: 20,
  lpPerBlock: 2_000,
  lpIskPerItem: 16_000,
  totalPerItem: 48_000,
  filled: 0.12,
};

export const STEREO: TurnInOfferDetail = {
  ...FAILOVER,
  objectiveId: 'obj-signal',
  campaignId: 'camp-minmatar',
  typeId: 97547,
  traderTypeId: 97623,
  traderName: 'Trail of Silence Trader',
  systemId: 30002537,
  systemName: 'Amo',
  filled: 0.31,
  factionId: 500002,
};

/** The same offer with no LP Value to count its LP at. */
export const FAILOVER_UNPRICED: TurnInOfferDetail = {
  ...FAILOVER,
  lpValue: null,
  lpIskPerItem: null,
  totalPerItem: 28_000,
  lpValueSource: null,
};

export const PHONE = { viewport: { value: 'mobile1', isRotated: false } };
