/**
 * One-off (decision 20261120-235011, step 2): copies every Late notice stored as a `statements`
 * doc (`kind: 'notice'`) into `lateNotices`, and every `statementLinks` doc into
 * `lateNoticeLinks`. Idempotent: a doc already copied is left alone, so a re-run copies nothing.
 * `--dry-run` only counts what it would copy. Run it once the functions that write
 * `lateNotices` are deployed (docs/deploy/late-notices.md).
 *
 *   cd functions && npm run build
 *   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/backfill-late-notices.mjs <projectId> [--dry-run] [corporationId ...]
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  applyLateNoticeBackfill,
  planLateNoticeBackfill,
} from '../lib/corpTaxBookLateNoticeBackfill.js';

const [projectId, ...rest] = process.argv.slice(2);
if (!projectId)
  throw new Error('usage: backfill-late-notices.mjs <projectId> [--dry-run] [corporationId ...]');
const dryRun = rest.includes('--dry-run');
const only = rest.filter((a) => /^\d+$/.test(a)).map(Number);

initializeApp({ projectId });
const db = getFirestore();
const corps = only.length
  ? only
  : (await db.collection('corps').listDocuments()).map((d) => Number(d.id));
let notices = 0;
let links = 0;
for (const corporationId of corps) {
  const plan = await planLateNoticeBackfill(db, corporationId);
  if (plan.notices.length + plan.links.length === 0) continue;
  console.log(corporationId, `notices: ${plan.notices.length}`, `links: ${plan.links.length}`);
  notices += plan.notices.length;
  links += plan.links.length;
  if (!dryRun) await applyLateNoticeBackfill(db, corporationId, plan);
}
console.log(
  dryRun ? 'dry run: nothing written' : 'copied',
  `notices: ${notices}`,
  `links: ${links}`
);
