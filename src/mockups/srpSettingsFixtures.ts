/** Sample data for the SRP settings mockup. Not shared with any other fixture. */

export type RuleKind = 'none' | 'fixed' | 'percent' | 'notCovered' | 'officer';

export interface HullRule {
  kind: RuleKind;
  /** Plain digit string for `fixed`; blank is invalid. */
  isk: string;
}

export interface HullClass {
  id: string;
  name: string;
}

export interface Hull {
  id: string;
  name: string;
  classId: string;
}

export const CORP_NAME = 'Ashen Vanguard';
export const SRP_LINK = 'https://neocomdesk.com/corp/srp?c=98765432';

export const CLASSES: HullClass[] = [
  { id: 'frigate', name: 'Frigates' },
  { id: 'cruiser', name: 'Cruisers' },
  { id: 'battlecruiser', name: 'Battlecruisers' },
  { id: 'battleship', name: 'Battleships' },
  { id: 'industrial', name: 'Industrials' },
  { id: 'capital', name: 'Capital ships' },
];

/** Hulls that already carry a Hull Rule (the rest of the game's hulls come from the add-hull search). */
export const HULLS: Hull[] = [
  { id: 'thorax', name: 'Thorax', classId: 'cruiser' },
  { id: 'vni', name: 'Vexor Navy Issue', classId: 'cruiser' },
  { id: 'gila', name: 'Gila', classId: 'cruiser' },
  { id: 'megathron', name: 'Megathron', classId: 'battleship' },
  { id: 'raven', name: 'Raven', classId: 'battleship' },
  { id: 'thanatos', name: 'Thanatos', classId: 'capital' },
];

export const SEARCH_RESULTS: { hull: Hull; classLabel: string; hasRule: boolean }[] = [
  { hull: HULLS[3]!, classLabel: 'Battleship', hasRule: true },
  {
    hull: { id: 'mnavy', name: 'Megathron Navy Issue', classId: 'battleship' },
    classLabel: 'Battleship',
    hasRule: false,
  },
  {
    hull: { id: 'mclass', name: 'Mega-class hauler', classId: 'industrial' },
    classLabel: 'Industrial',
    hasRule: false,
  },
];

export const NO_RULE: HullRule = { kind: 'none', isk: '' };

export const CONFIGURED_RULES: Record<string, HullRule> = {
  frigate: { kind: 'fixed', isk: '1500000' },
  cruiser: { kind: 'percent', isk: '' },
  battlecruiser: NO_RULE,
  battleship: { kind: 'fixed', isk: '180000000' },
  industrial: { kind: 'officer', isk: '' },
  capital: { kind: 'notCovered', isk: '' },
  thorax: NO_RULE,
  vni: { kind: 'officer', isk: '' },
  gila: { kind: 'notCovered', isk: '' },
  megathron: { kind: 'fixed', isk: '212000000' },
  raven: NO_RULE,
  thanatos: { kind: 'officer', isk: '' },
};

export interface SrpSettingsState {
  enabled: boolean;
  killmailPct: string;
  appraisalPct: string;
  windowDays: string;
  fleetRequired: boolean;
  rules: Record<string, HullRule>;
  expanded: string[];
}

export const CONFIGURED: SrpSettingsState = {
  enabled: true,
  killmailPct: '70',
  appraisalPct: '60',
  windowDays: '30',
  fleetRequired: true,
  rules: CONFIGURED_RULES,
  expanded: ['cruiser'],
};

export const INVALID: SrpSettingsState = {
  ...CONFIGURED,
  killmailPct: '140',
  appraisalPct: '60',
  rules: { ...CONFIGURED_RULES, battleship: { kind: 'fixed', isk: '' } },
  expanded: ['battleship'],
};

export const FIRST_TIME: SrpSettingsState = {
  enabled: false,
  killmailPct: '',
  appraisalPct: '',
  windowDays: '30',
  fleetRequired: false,
  rules: {},
  expanded: [],
};
