/**
 * One-off (decision 20261120-235011, step 2): copies every Late notice stored as a `statements`
 * doc (`kind: 'notice'`) into `lateNotices`, and every `statementLinks` doc into
 * `lateNoticeLinks`; brings an existing copy's mail state level with its legacy doc; then marks
 * the book backfilled, after which no read looks at the legacy docs. It also gives each payment
 * stored without `uids` its Miner's readers and its sender, and each `observed` row its
 * Character's Miner's readers and itself, so a main reads an alt's donations and mined days.
 * Idempotent: a re-run copies nothing new. A book that fails is reported and the run goes on. `--dry-run` only counts. Run it once the functions that write
 * `lateNotices` are deployed (docs/deploy/late-notices.md).
 *
 *   cd functions && npm run build
 *   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/backfill-late-notices.mjs <projectId> [--dry-run] [corporationId ...]
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  applyLateNoticeBackfill,
  applyPaymentReadersBackfill,
  backfillObservedReaders,
  planLateNoticeBackfill,
  planPaymentReadersBackfill,
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
let mail = 0;
let readers = 0;
let rowReaders = 0;
const failed = [];
// Every book is a Running account: the server now refuses a calendar Statement on every one.
// A book with no `runningAccountFrom` is listed, so an officer knows an older tab of it is refused.
const unswitched = [];
for (const corporationId of corps) {
  try {
    const book = await db.collection('corps').doc(String(corporationId)).get();
    if (
      book.exists &&
      book.get('active') === true &&
      typeof book.get('runningAccountFrom') !== 'string'
    )
      unswitched.push(corporationId);
    const plan = await planLateNoticeBackfill(db, corporationId);
    const paymentReaders = await planPaymentReadersBackfill(db, corporationId);
    const counts = [
      plan.notices.length,
      plan.links.length,
      plan.mail.length,
      paymentReaders.length,
    ];
    if (counts.some((n) => n > 0))
      console.log(
        corporationId,
        `notices: ${counts[0]}`,
        `links: ${counts[1]}`,
        `mail: ${counts[2]}`,
        `payment readers: ${counts[3]}`
      );
    notices += counts[0];
    links += counts[1];
    mail += counts[2];
    readers += counts[3];
    if (!dryRun) {
      // Marks the book even with nothing to copy, so its reads stop looking at the legacy docs.
      await applyLateNoticeBackfill(db, corporationId, plan);
      await applyPaymentReadersBackfill(db, corporationId, paymentReaders);
    }
    // Page by page (a book holds many rows); a dry run only counts.
    const rows = await backfillObservedReaders(db, corporationId, { dryRun });
    if (rows > 0) console.log(corporationId, `row readers: ${rows}`);
    rowReaders += rows;
  } catch (e) {
    // One book's failure (a notice issued mid-run, a timeout) leaves the rest to go on; re-run it.
    failed.push(corporationId);
    console.error(corporationId, 'failed:', e instanceof Error ? e.message : e);
  }
}
console.log(
  dryRun ? 'dry run: nothing written' : 'copied',
  `notices: ${notices}`,
  `links: ${links}`,
  `mail synced: ${mail}`,
  `payment readers: ${readers}`,
  `row readers: ${rowReaders}`
);
if (unswitched.length > 0)
  console.log(
    `books with no runningAccountFrom (calendar Statements refused): ${unswitched.join(' ')}`
  );
if (failed.length > 0) {
  console.error(`failed: ${failed.join(' ')} (re-run with these ids)`);
  process.exitCode = 1;
}
