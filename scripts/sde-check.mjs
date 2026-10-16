#!/usr/bin/env node
// Is there a newer game build to bake? For the nightly refresh
// (.github/workflows/sde-refresh.yml). Prints `update`, `build` and `reason`
// as key=value lines, for $GITHUB_OUTPUT.

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLatestUrl } from './lib/ccpStaticData.mjs';
import { ccpBuildFromZipUrl, fetchFuzzworkDump, sdeUpdateDecision } from './lib/sdeBuild.mjs';

const USER_AGENT = 'Neocom Desk (github.com/shawndibble/neocom-desk)';
const STAMP = join(dirname(fileURLToPath(import.meta.url)), 'sde-build.json');

const baked = await readFile(STAMP, 'utf8')
  .then((text) => JSON.parse(text).ccpBuild)
  .catch(() => null);
const [ccp, fuzzwork] = await Promise.all([
  resolveLatestUrl(USER_AGENT).then(ccpBuildFromZipUrl),
  fetchFuzzworkDump(USER_AGENT).then((dump) => dump.build),
]);
const { update, reason } = sdeUpdateDecision({ ccp, fuzzwork, baked });
console.log(`update=${update}`);
console.log(`build=${ccp}`);
console.log(`reason=${reason}`);
