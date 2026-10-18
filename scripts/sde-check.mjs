#!/usr/bin/env node
// Is there a newer game build to bake? For the nightly refresh
// (.github/workflows/sde-refresh.yml). Prints `update`, `build` and `reason`
// as key=value lines, for $GITHUB_OUTPUT; exits 1 when Fuzzwork has lagged a
// newer CCP build for days, so the run fails and files an issue.

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
