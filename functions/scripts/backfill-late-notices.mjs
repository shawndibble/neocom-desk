import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  applyLateNoticeBackfill,
  planLateNoticeBackfill,
  retireMinerTotals,
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
let totals = 0;
const failed = [];
for (const corporationId of corps) {
  try {
    const plan = await planLateNoticeBackfill(db, corporationId);
    if (plan.notices.length + plan.links.length > 0)
      console.log(corporationId, `notices: ${plan.notices.length}`, `links: ${plan.links.length}`);
    notices += plan.notices.length;
    links += plan.links.length;
    if (!dryRun) {
      await applyLateNoticeBackfill(db, corporationId, plan);
      totals += await retireMinerTotals(db, corporationId);
    }
  } catch (e) {
    failed.push(corporationId);
    console.error(corporationId, 'failed:', e instanceof Error ? e.message : e);
  }
}
console.log(
  dryRun ? 'dry run: nothing written' : 'copied',
  `notices: ${notices}`,
  `links: ${links}`,
  `retired miner totals: ${totals}`
);
if (failed.length > 0) {
  console.error(`failed: ${failed.join(' ')} (re-run with these ids)`);
  process.exitCode = 1;
}
