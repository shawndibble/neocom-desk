/**
 * Injectable clipboard writer/reader, mirroring src/esi/client's configureEsi
 * pattern: production code goes through the real Clipboard API, tests inject
 * a spy (jsdom has no usable navigator.clipboard).
 */
export type ClipboardWriter = (text: string) => Promise<void>;
export type ClipboardReader = () => Promise<string>;

type LaterWriter = (text: Promise<string>) => Promise<void>;

/**
 * The old way, for a page the Clipboard API is not offered to: it only exists on
 * https and localhost, so a dev server opened by its network address has none.
 * Throws when the browser refuses, so a caller still hears of a copy that did not happen.
 */
function legacyCopy(text: string): void {
  const box = document.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  box.style.position = 'fixed';
  box.style.opacity = '0';
  document.body.appendChild(box);
  box.select();
  try {
    if (!document.execCommand('copy')) throw new Error('The browser refused the copy');
  } finally {
    box.remove();
  }
}

/** Always a promise: with no Clipboard API this used to throw before it returned one. */
async function defaultWrite(text: string): Promise<void> {
  if (typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Refused (no permission, or the click's activation is spent): the old way may still work.
    }
  }
  legacyCopy(text);
}

let writer: ClipboardWriter = defaultWrite;
let reader: ClipboardReader = () => navigator.clipboard.readText();

const defaultLaterWriter: LaterWriter = (text) => {
  if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') {
    return text.then(writer);
  }
  const blob = text.then((value) => new Blob([value], { type: 'text/plain' }));
  return navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
};
let laterWriter: LaterWriter = defaultLaterWriter;

/** Override (or, passing null, restore) the clipboard writer. */
export function configureClipboard(customWriter: ClipboardWriter | null): void {
  writer = customWriter ?? defaultWrite;
  laterWriter = customWriter ? (text) => text.then(customWriter) : defaultLaterWriter;
}

/** Override (or, passing null, restore) the clipboard reader. */
export function configureClipboardReader(customReader: ClipboardReader | null): void {
  reader = customReader ?? (() => navigator.clipboard.readText());
}

export function writeToClipboard(text: string): Promise<void> {
  return writer(text);
}

/**
 * Copies text still being worked out (a network read) when the press
 * happened. Call it inside the click handler: Safari refuses a plain
 * `writeText` once an await has spent the click's user activation, but
 * accepts a `ClipboardItem` handed a promise synchronously. A rejected
 * `text` copies nothing.
 */
export function writeToClipboardLater(text: Promise<string>): Promise<void> {
  return laterWriter(text);
}

export function readFromClipboard(): Promise<string> {
  return reader();
}
