/** Shared by the D1-D3 capture specs: markers on the recorder's clock, paste, drag. */
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Locator } from '@playwright/test';
import { clickHere, glideTo, glideToPoint } from '../../recorder';

export class Markers {
  private t0 = 0;
  private list: { name: string; t: number; note: string }[] = [];
  /** Call right after startRecording; the first screencast frame lands within ~50 ms. */
  begin() {
    this.t0 = Date.now() / 1000;
  }
  mark(name: string, note: string) {
    this.list.push({ name, t: +(Date.now() / 1000 - this.t0).toFixed(2), note });
  }
  write(dir: string) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/markers.json`, JSON.stringify({ markers: this.list }, null, 2) + '\n');
  }
}

/** The app's global paste router listens on the document. */
export async function paste(page: Page, text: string) {
  await page.evaluate((t) => {
    const data = new DataTransfer();
    data.setData('text/plain', t);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  }, text);
}

/** Press on the current pointer position, glide to a point, release (dnd-kit pointer drag). */
export async function dragTo(page: Page, x: number, y: number, ms = 900) {
  await page.mouse.down();
  await page.mouse.move(x - 2, y + 40, { steps: 3 }).catch(() => undefined);
  await glideToPoint(page, x, y, ms);
  await page.mouse.move(x + 1, y + 1, { steps: 3 });
  await page.waitForTimeout(250);
  await page.mouse.up();
}

/** House pacing: glide 1000 ms, hover 400 ms, click. */
export async function go(page: Page, target: Locator, ms = 1000) {
  await glideTo(page, target, ms);
  await page.waitForTimeout(400);
  await clickHere(page);
}
export async function hover(page: Page, target: Locator, ms = 1000) {
  await glideTo(page, target, ms);
  await page.waitForTimeout(400);
}
/** Visible typing, about 60 ms per character. */
export async function type(target: Locator, text: string) {
  await target.pressSequentially(text, { delay: 60 });
}
