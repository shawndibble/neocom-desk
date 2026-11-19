/**
 * One-off (#6450): a grouping made before the fix left the absorbed Miners' Statements,
 * payments and the rest under their old ids, so an alt kept its own row in the Miners table.
 * This moves them onto the group, the way a new grouping now does. Dry run unless `--apply`;
 * a re-run finds nothing left. A dissolved group's old id is listed, not moved.
 *
 *   cd functions && npm run build
 *   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/rekey-grouped-miners.mjs <projectId> [--apply] [corporationId ...]
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { applyRekeyBackfill, planRekeyBackfill } from '../lib/corpTaxBookRekeyBackfill.js';

const [projectId, ...rest] = process.argv.slice(2);
if (!projectId)
  throw new Error('usage: rekey-grouped-miners.mjs <projectId> [--apply] [corporationId ...]');
const apply = rest.includes('--apply');
const only = rest.filter((a) => /^\d+$/.test(a)).map(Number);

initializeApp({ projectId });
const db = getFirestore();
const corps = only.length
  ? only
  : (await db.collection('corps').listDocuments()).map((d) => Number(d.id));
for (const corporationId of corps) {
  const plan = await planRekeyBackfill(db, corporationId);
  const kinds = { update: 0, move: 0, delete: 0 };
  for (const w of plan.writes) kinds[w.kind]++;
  console.log(
    corporationId,
    JSON.stringify(kinds),
    plan.unresolved.length ? `unresolved: ${plan.unresolved.join(', ')}` : ''
  );
  if (apply && plan.writes.length) await applyRekeyBackfill(db, plan);
}
console.log(apply ? 'applied' : 'dry run: nothing written (pass --apply)');
