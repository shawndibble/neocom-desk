import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import {
  mockPlannerColonies,
  HIGHSEC_SYSTEM,
  NULLSEC_SYSTEM,
  type Colony,
} from './support/tmpPiColonies';
import { mockHubPrices } from './support/piPrices';

const mk = (otherSystem: number): Colony[] => [
  {
    planetId: 40009077,
    systemId: HIGHSEC_SYSTEM,
    name: 'Bact I',
    type: 'oceanic',
    level: 5,
    extracts: [2073, 2073],
    heads: 8,
  },
  {
    planetId: 40009080,
    systemId: otherSystem,
    name: 'Water II',
    type: 'oceanic',
    level: 5,
    extracts: [2268, 2268],
    heads: 8,
  },
];
const OUT = process.env.PI_SHOTS!;
for (const [variant, sys] of [
  ['cross', NULLSEC_SYSTEM],
  ['same', HIGHSEC_SYSTEM],
] as const)
  for (const [label, vp] of [
    ['phone', { width: 390, height: 844 }],
    ['desk', { width: 1440, height: 900 }],
  ] as const)
    test(`${variant} ${label}`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(vp);
      await signInAndGoto(page, './planetary-industry/plan');
      await mockPlannerColonies(page, mk(sys));
      await mockHubPrices(page);
      await page.goto('./planetary-industry/plan');
      await expect(page.getByRole('heading', { name: 'Your planets' })).toBeVisible({
        timeout: 30_000,
      });
      await page.waitForTimeout(3000);
      const text = await page.locator('main').innerText();
      console.log(`### ${variant} ${label}\n${text}\n###`);
      console.log(
        'SURPLUS-LINES',
        JSON.stringify(text.split('\n').filter((l) => /uses the surplus/i.test(l)))
      );
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      console.log('SCROLLW', w, vp.width);
      await page.screenshot({ path: `${OUT}/${variant}-${label}.png`, fullPage: true });
      expect(w).toBeLessThanOrEqual(vp.width);
    });
