/** Sample data for the "Add my other corps" mockup; all names invented. */
export type CorpState =
  'ready' | 'connected' | 'needs-sign-in' | 'needs-role' | 'own-book' | 'gone-quiet' | 'hidden';

export interface MyCorp {
  id: number;
  name: string;
  /** The account character that is CEO of the corp. */
  ceo: string;
  /** Portrait id of the CEO character. Sample ids only. */
  ceoId: number;
  state: CorpState;
  /** Open Athanors the book already reads (connected corps only). */
  refineries?: number;
}

export const MAIN_CORP = 'Brass Meridian Logistics';

export const CORPS: MyCorp[] = [
  { id: 11, name: 'Ironvale Reach', ceo: 'Kestrel Vane', ceoId: 90000001, state: 'ready' },
  { id: 12, name: 'Ashen Harbor Mining', ceo: 'Mira Soltane', ceoId: 90000002, state: 'ready' },
  { id: 13, name: 'Cobalt Drift Syndicate', ceo: 'Dax Orlen', ceoId: 90000003, state: 'ready' },
  { id: 14, name: 'Tallow Station Co', ceo: 'Vesper Quill', ceoId: 90000004, state: 'ready' },
  { id: 15, name: 'Northgate Salvage', ceo: 'Ilya Brandt', ceoId: 90000005, state: 'ready' },
  { id: 16, name: 'Hollow Pine Holdings', ceo: 'Nova Thessaly', ceoId: 90000006, state: 'ready' },
  { id: 17, name: 'Quillfeather Trade', ceo: 'Rook Ansel', ceoId: 90000007, state: 'ready' },
  { id: 18, name: 'Sable Ridge Extraction', ceo: 'Tarn Ostrow', ceoId: 90000008, state: 'ready' },
  { id: 19, name: 'Emberlight Group', ceo: 'Sela Marrow', ceoId: 90000009, state: 'ready' },
  { id: 20, name: 'Gantry Point Mining', ceo: 'Oren Valk', ceoId: 90000010, state: 'ready' },
  { id: 21, name: 'Wren Hollow Corp', ceo: 'Lysa Dray', ceoId: 90000011, state: 'ready' },
  { id: 22, name: 'Dunmoor Freight', ceo: 'Pike Harrow', ceoId: 90000012, state: 'ready' },
];

const set = (over: Record<number, Partial<MyCorp>>): MyCorp[] =>
  CORPS.map((c) => ({ ...c, ...over[c.id] }));

/** The state right after a guided run of 12: mixed results. */
export const RESULT_CORPS: MyCorp[] = set({
  11: { state: 'connected', refineries: 1 },
  12: { state: 'connected', refineries: 1 },
  13: { state: 'connected', refineries: 2 },
  14: { state: 'connected', refineries: 1 },
  15: { state: 'connected', refineries: 1 },
  16: { state: 'connected', refineries: 1 },
  17: { state: 'connected', refineries: 1 },
  18: { state: 'needs-sign-in' },
  19: { state: 'own-book' },
  20: { state: 'needs-role' },
  21: { state: 'gone-quiet' },
  22: { state: 'connected', refineries: 1 },
});

/** Picker with two corps previously dismissed for good. */
export const PICKER_CORPS: MyCorp[] = set({
  21: { state: 'hidden' },
  22: { state: 'hidden' },
});
export const NEW_CORP: MyCorp = {
  id: 23,
  name: 'Ironvale Reach Two',
  ceo: 'Kestrel Vane',
  ceoId: 90000013,
  state: 'ready',
};
