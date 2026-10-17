/**
 * Injectable clipboard writer/reader, mirroring src/esi/client's configureEsi
 * pattern: production code goes through the real Clipboard API, tests inject
 * a spy (jsdom has no usable navigator.clipboard).
 */
export type ClipboardWriter = (text: string) => Promise<void>;
export type ClipboardReader = () => Promise<string>;

let writer: ClipboardWriter = (text) => navigator.clipboard.writeText(text);
let reader: ClipboardReader = () => navigator.clipboard.readText();
let customWriterSet = false;

/** Override (or, passing null, restore) the clipboard writer. */
export function configureClipboard(customWriter: ClipboardWriter | null): void {
  writer = customWriter ?? ((text) => navigator.clipboard.writeText(text));
  customWriterSet = customWriter !== null;
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
  if (
    !customWriterSet &&
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function'
  ) {
    const blob = text.then((value) => new Blob([value], { type: 'text/plain' }));
    return navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
  }
  return text.then(writer);
}

export function readFromClipboard(): Promise<string> {
  return reader();
}
