#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { USER_AGENT } from './lib/constants.mjs';
import { SCRIPTS_DIR } from './lib/paths.mjs';
import { resolveLatestUrl } from './lib/ccpStaticData.mjs';
import { ccpBuildFromZipUrl, fetchFuzzworkDump, sdeUpdateDecision } from './lib/sdeBuild.mjs';

const STAMP = join(SCRIPTS_DIR, 'sde-build.json');

const baked = await readFile(STAMP, 'utf8')
  .then((text) => JSON.parse(text).ccpBuild)
  .catch(() => null);
const [ccpUrl, fuzzwork] = await Promise.all([
  resolveLatestUrl(USER_AGENT),
  fetchFuzzworkDump(USER_AGENT).then((dump) => dump.build),
]);
const ccp = ccpBuildFromZipUrl(ccpUrl);
const shipped = await fetch(ccpUrl, {
  method: 'HEAD',
  headers: { 'User-Agent': USER_AGENT },
  signal: AbortSignal.timeout(30_000),
}).then((res) => Date.parse(res.headers.get('last-modified') ?? ''));
const ccpAgeDays = Number.isFinite(shipped) ? Math.floor((Date.now() - shipped) / 86_400_000) : 0;
const { update, stale, reason } = sdeUpdateDecision({ ccp, fuzzwork, baked, ccpAgeDays });
console.log(`update=${update}`);
console.log(`build=${ccp}`);
console.log(`reason=${reason}`);
if (stale) {
  console.error(`::error::${reason}`);
  process.exitCode = 1;
}
