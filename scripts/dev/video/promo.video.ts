/**
 * Promo video, every beat after beat 1: one test per clip, each writing `<OUT>/<clip>/` frames,
 * frames.txt and cursor.json (see recorder.ts). Mock data only: the sandbox's Test Pilot, a
 * seasoned skill sheet (veteranPilot.ts), mock courier hauls and a mock deal contract.
 *
 *   VIDEO_OUT=<dir> npx playwright test -c scripts/dev/video/video.config.ts promo
 */
import { test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openSandbox } from './sandboxPage';
import { installCourierContracts } from './courierContracts';
import { installDealContract } from './dealContract';
import { installRegionOrders } from './marketOrders';
import { installFirebaseMint } from './firebaseMint';
import {
  clickHere,
  glideTo,
  glideToPoint,
  hideSandboxNoise,
  placePointer,
  startRecording,
} from './recorder';

const OUT = process.env.VIDEO_OUT ?? 'test-results/video';
const AMAMAKE = 30002537;
const JITA = 30000142;
const FIT = readFileSync(new URL('./fixtures/megathron.eft', import.meta.url), 'utf8');
const CARGO = 'Nanite Repair Paste\t5000\nTritanium\t124500\nDamage Control II\t3\nNocxium\t220\n';

async function everything(page: Page) {
  await installCourierContracts(page);
  await installDealContract(page);
  await installRegionOrders(page, { 28668: 21_500 });
}

async function open(page: Page, path: string) {
  await hideSandboxNoise(page);
  await openSandbox(page, path, { systemId: AMAMAKE, veteran: true, before: everything });
}

/** The global paste router listens on the document; a real Ctrl+V needs a clipboard. */
async function paste(page: Page, text: string) {
  await page.evaluate((t) => {
    const data = new DataTransfer();
    data.setData('text/plain', t);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  }, text);
}

async function record(page: Page, clip: string, act: () => Promise<void>) {
  await page.screenshot({ path: `${OUT}/${clip}-before.png` });
  const recording = await startRecording(page, `${OUT}/${clip}`);
  await act();
  const result = await recording.stop();
  console.log(`${clip}: ${result.frames} frames over ${result.seconds.toFixed(2)}s`);
  await page.screenshot({ path: `${OUT}/${clip}-after.png` });
}

test('hook: route to Jita', async ({ page }) => {
  await open(page, `./travel/route?stops=${JITA}`);
  await page
    .getByText(/Current system/i)
    .first()
    .waitFor();
  await page.waitForTimeout(6_000);
  await placePointer(page, 980, 560);
  await record(page, 'hook', async () => {
    await page.waitForTimeout(700);
    await glideTo(page, page.getByText(/Current system/i).first(), 1100);
    await page.waitForTimeout(800);
    await glideTo(page, page.getByText('Safer', { exact: true }).first(), 1000);
    await page.waitForTimeout(2_200);
  });
});

test('beat 2a: travel settings', async ({ page }) => {
  await open(page, './settings/travel');
  const pod = page.getByText('Systems with recent pod kills');
  await pod.waitFor();
  await page.waitForTimeout(3_000);
  await placePointer(page, 1000, 300);
  await record(page, 'b2a-settings', async () => {
    await page.waitForTimeout(500);
    await glideTo(page, pod, 800);
    await page.waitForTimeout(200);
    await clickHere(page);
    await page.waitForTimeout(600);
    await glideTo(page, page.getByText('Triglavian minor victory systems', { exact: false }), 600);
    await page.waitForTimeout(150);
    await clickHere(page);
    await page.waitForTimeout(1_500);
  });
});

test('beat 2b: assets by jumps', async ({ page }) => {
  await open(page, './assets/items');
  const jumps = page.getByText('17 jumps');
  await jumps.waitFor();
  await page.waitForTimeout(3_000);
  await placePointer(page, 1000, 650);
  await record(page, 'b2b-assets', async () => {
    await page.waitForTimeout(400);
    await glideTo(page, jumps, 900);
    await page.waitForTimeout(1_800);
  });
});

test('beat 2c: contract deal', async ({ page }) => {
  await open(page, './contracts/history');
  const row = page.getByRole('row').nth(4).getByRole('button', { name: 'Item Exchange' });
  await row.waitFor();
  await page.waitForTimeout(3_000);
  await placePointer(page, 700, 760);
  await record(page, 'b2c-contract', async () => {
    await page.waitForTimeout(400);
    await glideTo(page, row, 700);
    await page.waitForTimeout(150);
    await clickHere(page);
    const diff = page.getByText('Difference');
    await diff.waitFor();
    await page.waitForTimeout(500);
    await glideTo(page, diff, 800);
    await page.waitForTimeout(2_500);
  });
});

test('beat 2d: courier by ISK per jump', async ({ page }) => {
  await open(page, './contracts/search/courier');
  const header = page.getByRole('button', { name: 'ISK/jump' });
  await header.waitFor();
  await page.waitForTimeout(4_000);
  await placePointer(page, 1000, 700);
  await record(page, 'b2d-courier', async () => {
    await page.waitForTimeout(400);
    await glideTo(page, header, 900);
    await page.waitForTimeout(400);
    await glideToPoint(page, 1150, 560, 1200);
    await page.waitForTimeout(1_200);
  });
});

test('beats 3-4: improve fit, then train', async ({ page }) => {
  await open(page, './assets/items');
  await page.getByText('17 jumps').waitFor();
  await paste(page, FIT);
  const improve = page.getByRole('button', { name: 'Improve', exact: true });
  await improve.waitFor();
  await page.waitForTimeout(6_000);
  await placePointer(page, 1050, 520);
  await record(page, 'b3-improve', async () => {
    await page.waitForTimeout(500);
    await glideTo(page, improve, 800);
    await page.waitForTimeout(150);
    await clickHere(page);
    const damage = page.getByRole('button', { name: 'More damage' });
    await damage.waitFor();
    await page.waitForTimeout(500);
    await glideTo(page, damage, 700);
    await page.waitForTimeout(150);
    await clickHere(page);
    await page.waitForTimeout(800);
    await page.getByText(/Checking/).waitFor({ state: 'detached', timeout: 60_000 });
    await page.waitForTimeout(400);
    await glideTo(page, page.getByText(/^\+\d+(\.\d)?%$/).first(), 900);
    await page.waitForTimeout(2_200);
  });
  const pilot = page.getByRole('button', { name: /^Pilot/ }).first();
  await placePointer(page, 1100, 600);
  await record(page, 'b4-train', async () => {
    await page.waitForTimeout(400);
    await glideTo(page, pilot, 800);
    await page.waitForTimeout(150);
    await clickHere(page);
    const adds = page.getByRole('button', { name: /^Add to plan/ });
    await adds.first().waitFor();
    await page.waitForTimeout(700);
    await glideTo(page, adds.nth(0), 700);
    await page.waitForTimeout(150);
    await clickHere(page);
    await page.waitForTimeout(700);
    await glideTo(page, adds.nth(1), 600);
    await page.waitForTimeout(150);
    await clickHere(page);
    await page.waitForTimeout(700);
    const openPlan = page.getByText(/Open skill plan/i).first();
    await glideTo(page, openPlan, 700);
    await page.waitForTimeout(150);
    await clickHere(page);
    await page.waitForTimeout(3_500);
  });
});

test('beat 6: paste anything', async ({ page }) => {
  await open(page, './skills/plans');
  await page.waitForTimeout(6_000);
  await placePointer(page, 1000, 560);
  await record(page, 'b6-paste', async () => {
    await page.waitForTimeout(900);
    await paste(page, FIT);
    await page.getByRole('button', { name: 'Improve', exact: true }).waitFor();
    await page.waitForTimeout(2_200);
    await paste(page, CARGO);
    await page
      .getByText(/Nanite Repair Paste/)
      .first()
      .waitFor();
    await page.waitForTimeout(2_500);
  });
});

test('montage stills', async ({ page }) => {
  await open(page, './skills/plans');
  const shots: [string, string][] = [
    ['m-skills', './skills/plans'],
    ['m-pi', './planetary-industry/plan'],
    ['m-corp', './corp'],
    ['m-assets', './assets/items'],
    ['m-route', `./travel/route?stops=${JITA}`],
    ['m-courier', './contracts/search/courier'],
    ['m-market', './market/browser?type=28668&region=all'],
    ['m-industry', './industry'],
  ];
  for (const [name, path] of shots) {
    await page.goto(path);
    await page.waitForTimeout(7_000);
    await page.mouse.move(1279, 719);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
});

const EMULATOR = 'http://127.0.0.1:8080/v1';
const DOCS = `${EMULATOR}/projects/demo-neocom-desk/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/**
 * Rewrites the newest survey in the Firestore emulator: its first scan moves `minutesAgo`
 * back (an entry with no text), and every other entry is added as a scan that long ago.
 */
async function backdateSurvey(scans: [number, string | null][]): Promise<void> {
  const get = async <T>(url: string) => (await (await fetch(url, { headers: OWNER })).json()) as T;
  const shares = await get<{ documents: { name: string }[] }>(`${DOCS}/shares?pageSize=100`);
  const survey = shares.documents.at(-1)!.name;
  const listed = await get<{ documents: { name: string; fields: Record<string, unknown> }[] }>(
    `${EMULATOR}/${survey}/surveyScans`
  );
  const first = listed.documents[0];
  const at = (minutes: number) => ({
    timestampValue: new Date(Date.now() - minutes * 60_000).toISOString(),
  });
  for (const [minutes, text] of scans) {
    if (text === null) {
      await fetch(`${EMULATOR}/${first.name}?updateMask.fieldPaths=createdAt`, {
        method: 'PATCH',
        headers: OWNER,
        body: JSON.stringify({ fields: { createdAt: at(minutes) } }),
      });
    } else {
      await fetch(`${EMULATOR}/${survey}/surveyScans`, {
        method: 'POST',
        headers: OWNER,
        body: JSON.stringify({
          fields: {
            text: { stringValue: text },
            createdAt: at(minutes),
            expiresAt: first.fields.expiresAt,
          },
        }),
      });
    }
  }
}

/** A lowsec belt's Survey Scanner copy, mined down between scans (ten minutes apart). */
function surveyScan(minedFraction: number): string {
  const rocks: [string, number, number, number, number][] = [
    // ore, units, m3 per unit, ISK per unit, km
    ['Scordite', 42_000, 0.15, 16, 12],
    ['Scordite', 38_500, 0.15, 16, 19],
    ['Pyroxeres', 61_000, 0.3, 21, 24],
    ['Pyroxeres', 27_800, 0.3, 21, 31],
    ['Kernite', 19_400, 1.2, 64, 15],
    ['Kernite', 22_600, 1.2, 64, 27],
    ['Omber', 16_200, 0.6, 38, 22],
  ];
  const fmt = (n: number, d = 0) =>
    // eslint-disable-next-line no-restricted-syntax -- fixture copies the game client's en-US survey text, not app UI
    n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const lines: string[] = [];
  let group = '';
  rocks.forEach(([ore, units, m3, isk, km], index) => {
    if (ore !== group) {
      lines.push(ore);
      group = ore;
    }
    // Nearer rocks go faster: the fleet works the close ones first.
    const left = Math.max(0, Math.round(units * (1 - minedFraction * (1.4 - index * 0.12))));
    lines.push(`${ore}\t${fmt(left)}\t${fmt(left * m3)} m3\t${fmt(left * isk, 2)} ISK\t${km} km`);
  });
  return lines.join('\n');
}

test.describe('with the Firestore emulator', () => {
  // A survey saves to Firestore: run `firebase emulators:start --only auth,firestore` and a
  // Vite with VITE_FIREBASE_EMULATORS=1 on 5174.
  test.use({ baseURL: 'http://localhost:5174/' });
  test('beat 6b: survey', async ({ page }) => {
    // Start from an empty emulator so the newest share is this take's survey.
    await fetch(
      `${EMULATOR.replace('/v1', '/emulator/v1')}/projects/demo-neocom-desk/databases/(default)/documents`,
      {
        method: 'DELETE',
      }
    );
    await installFirebaseMint(page);
    await open(page, './skills/plans');
    await page.waitForTimeout(5_000);
    // The first scan starts the survey; the emulator then backdates it and adds two more ten
    // minutes apart, so the pace reads like a real fleet's. The recorded paste is the fourth.
    await paste(page, surveyScan(0));
    await page
      .getByText(/mined|Mining survey/i)
      .first()
      .waitFor();
    await page.waitForTimeout(2_000);
    await backdateSurvey([
      [30, null],
      [20, surveyScan(0.12)],
      [10, surveyScan(0.24)],
    ]);
    await page.goto('./skills/plans');
    await page.waitForTimeout(6_000);
    await placePointer(page, 1000, 560);
    await record(page, 'b6b-survey', async () => {
      await page.waitForTimeout(700);
      await paste(page, surveyScan(0.36));
      await page
        .getByText(/% mined/)
        .first()
        .waitFor();
      await page.waitForTimeout(2_500);
      const view = page
        .getByRole('combobox')
        .filter({ hasText: /Ore left/ })
        .first();
      await glideTo(page, view, 800);
      await page.waitForTimeout(150);
      await clickHere(page);
      await page.waitForTimeout(800);
      const next = page.getByRole('option', { name: 'Depletion by ore' });
      await glideTo(page, next, 500);
      await page.waitForTimeout(150);
      await clickHere(page);
      await page.waitForTimeout(2_500);
    });
  });
});
