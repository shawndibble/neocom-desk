/** Invented corporations for the Add my other corps stories and tests. */
import {
  recordOutcome,
  startRun,
  type AddCorpsCandidate,
  type AddCorpsRun,
} from '@/engine/corpTaxBook/addCorpsRun';

const NAMES: [string, string][] = [
  ['Ironvale Reach', 'Kestrel Vane'],
  ['Ashen Harbor Mining', 'Mira Soltane'],
  ['Cobalt Drift Syndicate', 'Dax Orlen'],
  ['Tallow Station Co', 'Vesper Quill'],
  ['Northgate Salvage', 'Ilya Brandt'],
  ['Hollow Pine Holdings', 'Nova Thessaly'],
  ['Quillfeather Trade', 'Rook Ansel'],
  ['Sable Ridge Extraction', 'Tarn Ostrow'],
  ['Emberlight Group', 'Sela Marrow'],
  ['Gantry Point Mining', 'Oren Valk'],
  ['Wren Hollow Corp', 'Lysa Dray'],
  ['Dunmoor Freight', 'Pike Harrow'],
];

export const BOOK_CORPORATION_ID = 98000000;
export const EDITOR_ID = 90000000;

export const CORPS: AddCorpsCandidate[] = NAMES.map(([name, ceoName], i) => ({
  corporationId: 11 + i,
  ceoCharacterId: 90000001 + i,
  name,
  ceoName,
}));

export const corpName = (id: number): string =>
  CORPS.find((c) => c.corporationId === id)?.name ?? `Corp ${id}`;

export const freshRun = (): AddCorpsRun =>
  startRun({
    collectorCorporationId: BOOK_CORPORATION_ID,
    editorCharacterId: EDITOR_ID,
    queue: CORPS,
    coverageFrom: '2026-11-01',
  });

/** Three connected and the second skipped: the dialog is on corp 5 (index 4). */
export const midRun = (): AddCorpsRun => {
  let run = freshRun();
  run = recordOutcome(run, { kind: 'connected' });
  run = recordOutcome(run, { kind: 'skipped' });
  run = recordOutcome(run, { kind: 'connected' });
  run = recordOutcome(run, { kind: 'connected' });
  return run;
};
