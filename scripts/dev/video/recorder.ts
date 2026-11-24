/**
 * Frame recorder for the promo-video recordings. Playwright's own `recordVideo` encodes a soft,
 * low-bitrate VP8; this captures the page through the Chrome DevTools screencast at the full
 * device-pixel size instead, keeping each frame's timestamp, and `frames.txt` is an ffmpeg concat
 * list that replays them at their real timing:
 *   ffmpeg -f concat -safe 0 -i frames.txt -vsync cfr -r 30 -pix_fmt yuv420p out.mp4
 *
 * Also draws a cursor (headless Chromium has none) that follows the mouse with a click pulse.
 */
import type { Locator, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CURSOR_SCRIPT = `
(() => {
  const install = () => {
    if (document.getElementById('__video-cursor')) return;
    const style = document.createElement('style');
    style.textContent = \`
      #__video-cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; z-index: 2147483647;
        pointer-events: none; transform: translate(-200px, -200px); transition: transform 16ms linear; }
      #__video-cursor svg { filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
      #__video-cursor .pulse { position: absolute; left: -14px; top: -14px; width: 28px; height: 28px; border-radius: 50%;
        border: 2px solid rgba(94, 197, 255, .9); opacity: 0; }
      #__video-cursor.down .pulse { animation: __video-pulse 420ms ease-out; }
      @keyframes __video-pulse { from { opacity: 1; transform: scale(.4); } to { opacity: 0; transform: scale(1.6); } }
    \`;
    document.head.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = '__video-cursor';
    cursor.innerHTML = '<div class="pulse"></div><svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 13.8 L10.6 20.5 L13.4 19.2 L10.4 12.6 L16.5 12.4 Z" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);
    addEventListener('mousemove', (e) => { cursor.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
    addEventListener('mousedown', () => { cursor.classList.remove('down'); void cursor.offsetWidth; cursor.classList.add('down'); }, true);
  };
  if (document.body) install(); else addEventListener('DOMContentLoaded', install);
})();
`;

export async function installCursor(page: Page): Promise<void> {
  await page.addInitScript(CURSOR_SCRIPT);
}

export interface Recording {
  stop(): Promise<{ frames: number; seconds: number }>;
}

export async function startRecording(page: Page, dir: string): Promise<Recording> {
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames: { file: string; at: number }[] = [];
  cdp.on('Page.screencastFrame', (frame) => {
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

/** Moves the mouse to an element's centre in small steps, so the drawn cursor glides. */
export async function glideTo(page: Page, target: Locator, steps = 25): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error(`no box for ${target.toString()}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
}
