/**
 * Signed-in sandbox page for the promo-video recordings: the manual-testing sandbox's fake
 * EVE SSO and ESI (scripts/dev/moons-sandbox.local.ts) without the Firebase emulator parts,
 * plus a chosen Current System. No real character, corp or ESI call is involved.
 */
import type { Page } from '@playwright/test';
import { installEsiMock } from '../../../e2e/support/mockEsi';
import { installSsoMock } from '../../../e2e/support/mockSso';
import { signInAndGoto } from '../../../e2e/support/authSeed';
import { CHARACTER_ID, SCOPES } from '../../../e2e/support/fixtureData';
import { installPersonalEsi } from '../sandbox/personalEsi';
import { installOpenPrices } from '../sandbox/prices';
import { scopesForGroup } from '../../../src/esi/scopes';
import { SCOPE_GROUPS } from '../../../src/esi/registry';
import { installVeteranPilot } from './veteranPilot';

export async function openSandbox(
  page: Page,
  path: string,
  options: { systemId?: number; veteran?: boolean; before?: (page: Page) => Promise<void> } = {}
): Promise<void> {
  const scopes = [
    ...new Set([...SCOPES, ...SCOPE_GROUPS.flatMap((group) => scopesForGroup(group))]),
  ];
  await installSsoMock(page, scopes);
  await installEsiMock(page);
  await installPersonalEsi(page);
  await installOpenPrices(page);
  // Real ship renders, icons and portraits: the e2e mock answers a blank SVG.
  await page.route('https://images.evetech.net/**', (route) => route.continue());
  if (options.systemId !== undefined) {
    const systemId = options.systemId;
    await page.route(`https://esi.evetech.net/**/characters/${CHARACTER_ID}/location**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ solar_system_id: systemId }),
      })
    );
  }
  if (options.veteran) await installVeteranPilot(page);
  await options.before?.(page);
  await signInAndGoto(page, path, scopes);
}
