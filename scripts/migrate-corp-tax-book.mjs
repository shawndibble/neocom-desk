#!/usr/bin/env node
// One-off move of Corp Tax Books from `corpTaxBooks/{corp}` to `corps/{corp}`
// (issue #4858, ADR 0026). Admin SDK, so it needs credentials for the shared
// Firebase project: `gcloud auth application-default login`, then run it.
//
//   node scripts/migrate-corp-tax-book.mjs --project <firebase-project> [--corp 98000001]
//        [--apply] [--delete-old]
//
// Default is a dry run that only counts. `--apply` copies every document and
// subcollection, skipping a destination doc that already exists, so a re-run
// is safe. `--delete-old` removes the old tree, and only for a corp whose copy
// matches the source document for document. Run order: copy, deploy functions
// and rules, merge the PR, check the Mining Tax page, then `--delete-old`.
//
// Against the emulator: set FIRESTORE_EMULATOR_HOST first.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const require = createRequire(fileURLToPath(new URL('../functions/package.json', import.meta.url)));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const { values: args } = parseArgs({
  options: {
    project: { type: 'string' },
    corp: { type: 'string' },
    apply: { type: 'boolean', default: false },
    'delete-old': { type: 'boolean', default: false },
  },
});

if (!args.project) {
  console.error('Pass --project <firebase-project-id>.');
  process.exit(1);
}

initializeApp({ projectId: args.project });
const db = getFirestore();
const OLD = 'corpTaxBooks';
const NEW = 'corps';

/** Every document under `ref`'s subcollections, depth first, as `[relativePath, snapshot]`. */
async function* walk(ref, prefix = '') {
  for (const col of await ref.listCollections()) {
    const snap = await col.get();
    for (const doc of snap.docs) {
      yield [`${prefix}${col.id}/${doc.id}`, doc];
      yield* walk(doc.ref, `${prefix}${col.id}/${doc.id}/`);
    }
    // A document that exists only as a path to deeper data has no snapshot above; reach it too.
    for (const ghost of await col.listDocuments()) {
      if (snap.docs.some((d) => d.id === ghost.id)) continue;
      yield* walk(ghost, `${prefix}${col.id}/${ghost.id}/`);
    }
  }
}

async function copyCorp(corp) {
  const from = db.collection(OLD).doc(corp);
  const to = db.collection(NEW).doc(corp);
  const rootSnap = await from.get();
  const entries = rootSnap.exists ? [['', rootSnap]] : [];
  for await (const entry of walk(from)) entries.push(entry);

  let copied = 0;
  let skipped = 0;
  let writer = db.batch();
  let pending = 0;
  for (const [path, snap] of entries) {
    const dest = path === '' ? to : db.doc(`${NEW}/${corp}/${path}`);
    if ((await dest.get()).exists) {
      skipped += 1;
      continue;
    }
    copied += 1;
    if (!args.apply) continue;
    writer.set(dest, snap.data());
    pending += 1;
    if (pending === 400) {
      await writer.commit();
      writer = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await writer.commit();
  console.log(
    `${corp}: ${entries.length} docs, ${copied} ${args.apply ? 'copied' : 'to copy'}, ${skipped} already there`
  );
  return entries;
}

async function sameTree(corp, entries) {
  for (const [path] of entries) {
    const dest = path === '' ? db.doc(`${NEW}/${corp}`) : db.doc(`${NEW}/${corp}/${path}`);
    if (!(await dest.get()).exists) return false;
  }
  return true;
}

const corps = args.corp ? [args.corp] : (await db.collection(OLD).listDocuments()).map((d) => d.id);
if (corps.length === 0) console.log('No Tax Books under corpTaxBooks.');

for (const corp of corps) {
  const entries = await copyCorp(corp);
  if (!args['delete-old']) continue;
  if (!args.apply) {
    console.log(`${corp}: would delete the old tree (dry run)`);
    continue;
  }
  if (!(await sameTree(corp, entries))) {
    console.error(`${corp}: copy does not match the source, old tree kept`);
    continue;
  }
  await db.recursiveDelete(db.collection(OLD).doc(corp));
  console.log(`${corp}: old tree deleted`);
}
