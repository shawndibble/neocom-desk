/**
 * Frame recorder for the promo-video recordings. Playwright's own `recordVideo` encodes a soft,
 * low-bitrate VP8; this captures the page through the Chrome DevTools screencast at the full
 * device-pixel size instead, keeping each frame's timestamp, and `frames.txt` is an ffmpeg concat
 * list that replays them at their real timing:
 *   ffmpeg -f concat -safe 0 -i frames.txt -vsync cfr -r 30 -pix_fmt yuv420p out.mp4
 *
 * The cursor is not in the frames: see `CursorEvent`.
 */
import type { Locator, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The pointer's path for the editor to draw: headless Chromium shows no cursor, and one drawn in
 * the page only moves when a screencast frame happens to land, which reads as a stutter. Instead
 * the recording keeps each glide and click with its time, and the video tool draws the cursor
 * at a steady frame rate with easing (cursor.json, written beside frames.txt).
 */
export interface CursorEvent {
  kind: 'glide' | 'click';
  /** Seconds since the first recorded frame. */
  start: number;
  end: number;
  /** CSS pixels of the viewport. */
  x: number;
  y: number;
}

let track: { wallStart: number; events: CursorEvent[]; x: number; y: number } | null = null;
let pointer = { x: 0, y: 0 };

const now = () => Date.now() / 1000;

export interface Recording {
  stop(): Promise<{ frames: number; seconds: number }>;
}

export async function startRecording(page: Page, dir: string): Promise<Recording> {
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames: { file: string; at: number }[] = [];
  track = { wallStart: 0, events: [], x: pointer.x, y: pointer.y };
  cdp.on('Page.screencastFrame', (frame) => {
    if (frames.length === 0 && track) track.wallStart = frame.metadata.timestamp ?? now();
    const file = join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(frame.data, 'base64'));
    frames.push({ file, at: frame.metadata.timestamp ?? Date.now() / 1000 });
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
  });
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const scale = await page.evaluate(() => window.devicePixelRatio);
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 95,
    maxWidth: Math.round(viewport.width * scale),
    maxHeight: Math.round(viewport.height * scale),
    everyNthFrame: 1,
  });
  return {
    async stop() {
      const end = Date.now() / 1000;
      await cdp.send('Page.stopScreencast');
      const lines: string[] = [];
      frames.forEach((frame, index) => {
        const next = frames[index + 1]?.at ?? end;
        lines.push(
          `file '${frame.file}'`,
          `duration ${Math.max(0.001, next - frame.at).toFixed(4)}`
        );
      });
      // The concat demuxer drops the last file's duration unless the file is repeated.
      if (frames.length > 0) lines.push(`file '${frames[frames.length - 1].file}'`);
      writeFileSync(join(dir, 'frames.txt'), lines.join('\n') + '\n');
      const cursor = {
        from: { x: track?.x ?? 0, y: track?.y ?? 0 },
        events: (track?.events ?? []).map((event) => ({
          ...event,
          start: event.start - (track?.wallStart ?? 0),
          end: event.end - (track?.wallStart ?? 0),
        })),
      };
      writeFileSync(join(dir, 'cursor.json'), JSON.stringify(cursor, null, 2) + '\n');
      track = null;
      const seconds = frames.length > 0 ? end - frames[0].at : 0;
      return { frames: frames.length, seconds };
    },
  };
}

/** Removes the sandbox's harmless "Sync error" strip (the fake token cannot sync) from shots. */
export async function hideSandboxNoise(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const strip = () => {
      for (const node of document.querySelectorAll('p[data-status-item].text-danger'))
        node.removeAttribute('data-status-item');
    };
    new MutationObserver(strip).observe(document, { childList: true, subtree: true });
  });
}

/** Where an element's centre is, in viewport CSS pixels. */
async function centreOf(target: Locator): Promise<{ x: number; y: number }> {
  const box = await target.boundingBox();
  if (!box) throw new Error(`no box for ${target.toString()}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Glides the drawn cursor to a point over `ms`. The real mouse jumps there only when the glide
 * ends, so hover styles appear as the drawn cursor arrives rather than ahead of it.
 */
export async function glideToPoint(page: Page, x: number, y: number, ms = 700): Promise<void> {
  const start = now();
  await page.waitForTimeout(ms);
  await page.mouse.move(x, y);
  pointer = { x, y };
  track?.events.push({ kind: 'glide', start, end: start + ms / 1000, x, y });
}

export async function glideTo(page: Page, target: Locator, ms = 700): Promise<void> {
  const { x, y } = await centreOf(target);
  await glideToPoint(page, x, y, ms);
}

/** Clicks where the cursor is (after a glide), recording the press for the click pulse. */
export async function clickHere(page: Page): Promise<void> {
  const at = now();
  track?.events.push({ kind: 'click', start: at, end: at + 0.42, ...pointer });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
}

/** Places the mouse without a glide (before recording starts). */
export async function placePointer(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  pointer = { x, y };
}
