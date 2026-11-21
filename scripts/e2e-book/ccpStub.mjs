/**
 * Loaded into the Functions emulator (`NODE_OPTIONS=--import`) for the Corp Tax Book browser
 * tests (`playwright.book.config.ts`). The callables reach CCP for two things: the JWKS that
 * signs an EVE access token, and ESI for who a Character is (corporation, roles, the CEO). This
 * answers both for the fake identities of `e2e/support/fixtureData.ts`, so the real server code
 * runs end to end and nothing leaves the machine. Every other host goes to the real `fetch`.
 *
 * The roster rule is shared with `e2e/support/taxBook/identities.ts`: every Character is in the
 * officer's corporation, except ids from LEFT_FROM up (leavers and guests), in OUTSIDE_CORP.
 */
import { readFileSync } from 'node:fs';

const keyDir = process.env.E2E_BOOK_KEY_DIR;
const OFFICER = 90000001;
const CORP = 98000001;
const OUTSIDE_CORP = 98999999;
const LEFT_FROM = 90008000;

const corpOf = (id) => (id >= LEFT_FROM ? OUTSIDE_CORP : CORP);
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function answerEsi(path, init) {
  let m = /^\/(?:latest\/)?characters\/(\d+)\/?$/.exec(path);
  if (m) return json({ name: `Pilot ${m[1]}`, corporation_id: corpOf(Number(m[1])) });
  m = /^\/(?:latest\/)?characters\/(\d+)\/roles\/?$/.exec(path);
  if (m) return json({ roles: Number(m[1]) === OFFICER ? ['Director'] : [] });
  m = /^\/(?:latest\/)?corporations\/(\d+)\/?$/.exec(path);
  if (m) return json({ name: `Corp ${m[1]}`, ticker: 'E2E', ceo_id: OFFICER, member_count: 10 });
  if (/^\/(?:latest\/)?characters\/affiliation\/?$/.test(path)) {
    const ids = JSON.parse(String(init?.body ?? '[]'));
    return json(ids.map((id) => ({ character_id: id, corporation_id: corpOf(id) })));
  }
  if (/^\/(?:latest\/)?universe\/names\/?$/.test(path)) {
    const ids = JSON.parse(String(init?.body ?? '[]'));
    return json(ids.map((id) => ({ id, name: `Pilot ${id}`, category: 'character' })));
  }
  return json({ error: 'not stubbed' }, 404);
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.host === 'login.eveonline.com' && url.pathname === '/oauth/jwks') {
    return json(JSON.parse(readFileSync(`${keyDir}/jwks.json`, 'utf8')));
  }
  if (url.host === 'esi.evetech.net') return answerEsi(url.pathname, init);
  return realFetch(input, init);
};
