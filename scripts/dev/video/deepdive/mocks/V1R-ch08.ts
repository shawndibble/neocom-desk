/**
 * V1 reshoot ch08 extras on top of D6's mocks: system names resolve on killmail rows (D6's names
 * answer left them as "#30002813"), the unknown pilot (Vorlag Reinhardt) gets an employment history
 * and wallet trades with Arden, and the Interactions tab is patched on its way to the page so it
 * opens on "This character" (rows) instead of flashing an empty Corporation scope. No source file is
 * touched.
 */
import type { Page, Route } from '@playwright/test';
import { ARDEN } from '../cast';
import { ALLIANCES, CORPS, PILOTS } from './D6-pilots';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
export const UNKNOWN = PILOTS.find((p) => p.name === 'Vorlag Reinhardt')!;
const SYSTEM_NAMES: Record<number, string> = { 30_002_813: 'Tama', 30_002_809: 'Sujarento' };
const FIRST = ['Aurelio', 'Brynja', 'Cassian', 'Delphine', 'Emeric', 'Fiora', 'Gunnar', 'Helene', 'Ignatz', 'Jovana', 'Kellan', 'Lucan', 'Maren', 'Nikolai', 'Oriel', 'Petra', 'Quentin', 'Rosalind', 'Stellan', 'Thea'];
const LAST = ['Varga', 'Holloway', 'Ferreira', 'Okonkwo', 'Lindqvist', 'Moreau', 'Dragan', 'Whitlock', 'Sandoval', 'Eriksen', 'Tanaka-Bell', 'Corrigan'];
const bystanderName = (id: number) => `${FIRST[id % FIRST.length]} ${LAST[Math.floor(id / 7) % LAST.length]}`;
const isBystander = (id: number) => (id >= 2_100_000_000 && id < 2_100_001_000) || (id >= 2_105_000_000 && id < 2_107_000_000);

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

/** Register after installD6Mocks: later routes win; anything not handled here falls back to D6's. */
export async function installV1RCh08(page: Page) {
  await page.route('https://esi.evetech.net/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/(latest|dev|v\d+)\//, '/');
    const method = request.method();
    if (path === '/universe/names' && method === 'POST') {
      let ids: number[] = [];
      try { ids = JSON.parse(request.postData() ?? '[]'); } catch { /* fall back */ }
      if (!ids.some((id) => SYSTEM_NAMES[id])) return route.fallback();
      const pilots = new Map(PILOTS.map((p) => [p.id, p]));
      const corps = new Map(CORPS.map((x) => [x.id, x]));
      const allies = new Map(ALLIANCES.map((x) => [x.id, x]));
      return json(route, ids.flatMap((id) => {
        if (SYSTEM_NAMES[id]) return [{ id, name: SYSTEM_NAMES[id], category: 'solar_system' }];
        const p = pilots.get(id);
        if (p) return [{ id, name: p.name, category: 'character' }];
        if (isBystander(id)) return [{ id, name: bystanderName(id), category: 'character' }];
        if (id === 1_000_009) return [{ id, name: 'Caldari Provisions', category: 'corporation' }];
        const c = corps.get(id);
        if (c) return [{ id, name: c.name, category: 'corporation' }];
        const a = allies.get(id);
        if (a) return [{ id, name: a.name, category: 'alliance' }];
        return [];
      }));
    }
    const history = /^\/characters\/(\d+)\/corporationhistory$/.exec(path);
    if (history && Number(history[1]) === UNKNOWN.id) {
      const c = (n: string) => CORPS.find((x) => x.name.startsWith(n))!.id;
      return json(route, [
        { corporation_id: UNKNOWN.corpId, record_id: 4, start_date: iso(Date.now() - 210 * DAY) },
        { corporation_id: c('Obsidian'), record_id: 3, start_date: iso(Date.now() - 760 * DAY) },
        { corporation_id: c('Dusk'), record_id: 2, start_date: iso(Date.now() - 1_240 * DAY) },
        { corporation_id: 1_000_009, record_id: 1, start_date: iso(Date.now() - UNKNOWN.ageMonths * 30.4 * DAY) },
      ]);
    }
    if (path === `/characters/${ARDEN.id}/wallet/journal` && method === 'GET') {
      return json(route, [
        { id: 9_100_011, amount: 48_000_000, balance: 612_000_000, date: iso(Date.now() - 6 * DAY), description: `${UNKNOWN.name} deposited cash`, first_party_id: UNKNOWN.id, second_party_id: ARDEN.id, ref_type: 'player_donation', reason: 'Salvage split, thanks' },
        { id: 9_100_012, amount: -12_500_000, balance: 564_000_000, date: iso(Date.now() - 19 * DAY), description: `Arden Kessil deposited cash into ${UNKNOWN.name}`, first_party_id: ARDEN.id, second_party_id: UNKNOWN.id, ref_type: 'player_donation', reason: 'Split of the fuel run' },
        { id: 9_100_013, amount: 31_000_000, balance: 576_000_000, date: iso(Date.now() - 41 * DAY), description: 'Contract payment', first_party_id: UNKNOWN.id, second_party_id: ARDEN.id, ref_type: 'contract_price', reason: '' },
      ]);
    }
    return route.fallback();
  });

  // Interactions opens on "This character" (rows) instead of the Corporation scope.
  await page.route('**/src/features/interactions/InteractionsTab.tsx*', async (route) => {
    const response = await route.fetch();
    const code = await response.text();
    const patched = code.replace(/choice \?\? \(corpOffered \? "corporation" : characters\.length > 1 \? "all" : "current"\)/, '(choice ?? "current")');
    if (patched === code) console.log('V1R WARNING: InteractionsTab scope patch did not apply');
    await route.fulfill({ response, body: patched });
  });
}
