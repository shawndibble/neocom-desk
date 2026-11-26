export const FUZZWORK_DUMP_URL = 'https://www.fuzzwork.co.uk/dump/';
const FUZZWORK_DUMP = /_(\d+)_(\d{8})_(\d{6})\./g;
const CCP_ZIP = /eve-online-static-data-(\d+)-jsonl\.zip$/;

export function fuzzworkDumpFromListing(html) {
  const dirs = new Set([...html.matchAll(FUZZWORK_DUMP)].map((m) => `${m[1]}_${m[2]}_${m[3]}`));
  if (dirs.size === 0) throw new Error('Fuzzwork /dump/latest/ names no build-numbered dump');
  if (dirs.size > 1)
    throw new Error(`Fuzzwork /dump/latest/ names more than one dump: ${[...dirs]}`);
  const [dir] = dirs;
  return { dir, build: Number(dir.split('_')[0]) };
}

export async function fetchFuzzworkDump(userAgent) {
  const url = `${FUZZWORK_DUMP_URL}latest/`;
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return fuzzworkDumpFromListing(await res.text());
}

export function ccpBuildFromZipUrl(url) {
  const match = new URL(url).pathname.match(CCP_ZIP);
  if (!match) throw new Error(`unrecognised CCP static data file: ${url}`);
  return Number(match[1]);
}

export function ccpBuildFromSdeJsonl(text) {
  const build = JSON.parse(text.trim().split('\n')[0]).buildNumber;
  if (!Number.isInteger(build)) throw new Error('_sde.jsonl has no buildNumber');
  return build;
}

const MAX_FUZZWORK_LAG_DAYS = 3;

export function sdeUpdateDecision({ ccp, fuzzwork, baked, ccpAgeDays = 0 }) {
  const behind = baked === null || baked < ccp;
  if (ccp !== fuzzwork) {
    if (behind && ccpAgeDays > MAX_FUZZWORK_LAG_DAYS) {
      return {
        update: false,
        stale: true,
        reason: `Fuzzwork is still on ${fuzzwork}, ${ccpAgeDays} days after CCP shipped ${ccp}`,
      };
    }
    return {
      update: false,
      stale: false,
      reason: `Fuzzwork is on ${fuzzwork}, CCP on ${ccp}: waiting for them to agree`,
    };
  }
  if (!behind) return { update: false, stale: false, reason: `build ${ccp} is already baked` };
  return {
    update: true,
    stale: false,
    reason: `build ${ccp} replaces ${baked ?? 'an unstamped bake'}`,
  };
}
