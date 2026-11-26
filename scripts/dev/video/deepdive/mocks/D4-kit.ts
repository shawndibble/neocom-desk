/**
 * Recording helpers shared by the D4 and D6 captures (own file): paced glide + click, smooth
 * scrolling, a paste that goes through the app's paste router, and markers.json written beside
 * frames.txt on the recorder's clock.
 */
import type { Locator, Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { clickHere, glideTo, glideToPoint, startRecording } from '../../recorder';

export const GLIDE_MS = 1000;
export const AIM_MS = 400;
export const HOLD_MS = 4000;
export const SETTLE_MS = 2000;

export interface Marker {
  name: string;
  t: number;
  note: string;
}

export interface TakeContext {
  page: Page;
  mark(name: string, note: string): void;
  /** Glide to a locator, pause over it, click. */
  click(target: Locator, ms?: number): Promise<void>;
  /** Glide to a locator and rest there (no click). */
  hover(target: Locator, ms?: number): Promise<void>;
  /** Glide to a viewport point and rest. */
  hoverPoint(x: number, y: number, ms?: number): Promise<void>;
  /** Glide to a point, pause, click. */
  clickPoint(x: number, y: number, ms?: number): Promise<void>;
  /** Hold still so the editor can sit on the result (default 4 s). */
  hold(ms?: number): Promise<void>;
  /** Small, slow wheel scrolls at the current pointer position. */
  scroll(dy: number): Promise<void>;
  /** Typing at a visible pace (about 60 ms per character). */
  type(text: string): Promise<void>;
  /** Left mouse drag with a visible glide from one point to another. */
  drag(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void>;
  /** Wall-clock hook the cursor glides write on. */
  wall(): number;
}

const now = () => Date.now() / 1000;
/** D4_QUICK=1 shortens every pause, for working out a take's steps (never for the real recording). */
const QUICK = process.env.D4_QUICK === '1';

/** Dispatches a clipboard paste on the document (the router listens there). */
export async function pasteText(page: Page, text: string) {
  await page.evaluate((t) => {
    const data = new DataTransfer();
    data.setData('text/plain', t);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  }, text);
}

export async function runTake(
  page: Page,
  dir: string,
  act: (ctx: TakeContext) => Promise<void>
): Promise<{ seconds: number; markers: Marker[] }> {
  mkdirSync(dir, { recursive: true });
  const recording = await startRecording(page, dir);
  const startWall = now();
  const marks: { name: string; wall: number; note: string }[] = [];
  let firstGlideWall: number | null = null;
  const noteGlide = () => {
    firstGlideWall ??= now();
  };
  const hold = (ms = HOLD_MS) => page.waitForTimeout(QUICK ? 150 : ms);
  const ctx: TakeContext = {
    page,
    mark: (name, note) => {
      marks.push({ name, wall: now(), note });
      if (QUICK) void page.screenshot({ path: `${dir}/q-${name}.png` }).catch(() => undefined);
    },
    async click(target, ms = GLIDE_MS) {
      await target.scrollIntoViewIfNeeded();
      noteGlide();
      await glideTo(page, target, QUICK ? 100 : ms);
      await page.waitForTimeout(QUICK ? 50 : AIM_MS);
      await clickHere(page);
    },
    async hover(target, ms = GLIDE_MS) {
      noteGlide();
      await glideTo(page, target, ms);
    },
    async hoverPoint(x, y, ms = GLIDE_MS) {
      noteGlide();
      await glideToPoint(page, x, y, ms);
    },
    async clickPoint(x, y, ms = GLIDE_MS) {
      noteGlide();
      await glideToPoint(page, x, y, ms);
      await page.waitForTimeout(AIM_MS);
      await clickHere(page);
    },
    hold,
    async scroll(dy) {
      const steps = Math.max(1, Math.round(Math.abs(dy) / 30));
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, Math.sign(dy) * 30);
        await page.waitForTimeout(55);
      }
      await page.waitForTimeout(600);
    },
    async type(text) {
      await page.keyboard.type(text, { delay: 60 });
    },
    async drag(from, to) {
      noteGlide();
      await glideToPoint(page, from.x, from.y, GLIDE_MS);
      await page.waitForTimeout(AIM_MS);
      await page.mouse.down();
      const steps = 24;
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(
          from.x + ((to.x - from.x) * i) / steps,
          from.y + ((to.y - from.y) * i) / steps
        );
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(AIM_MS);
      await page.mouse.up();
    },
    wall: now,
  };
  await act(ctx);
  const result = await recording.stop();
  // The recorder's clock starts at its first frame; cursor.json's first glide tells us when that was.
  let offset = startWall;
  try {
    const cursor = JSON.parse(readFileSync(`${dir}/cursor.json`, 'utf8')) as {
      events: { start: number }[];
    };
    if (firstGlideWall !== null && cursor.events[0]) offset = firstGlideWall - cursor.events[0].start;
  } catch {
    /* keep the start-time estimate */
  }
  const markers = marks.map((m) => ({
    name: m.name,
    t: Math.round((m.wall - offset) * 100) / 100,
    note: m.note,
  }));
  writeFileSync(`${dir}/markers.json`, JSON.stringify({ markers }, null, 2) + '\n');
  console.log(`${dir}: ${result.frames} frames, ${result.seconds.toFixed(1)}s, ${markers.length} markers`);
  return { seconds: result.seconds, markers };
}
