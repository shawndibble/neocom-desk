/**
 * Injectable clipboard writer/reader, mirroring src/esi/client's configureEsi
 * pattern: production code goes through the real Clipboard API, tests inject
 * a spy (jsdom has no usable navigator.clipboard).
 */
export type ClipboardWriter = (text: string) => Promise<void>;
export type ClipboardReader = () => Promise<string>;

let writer: ClipboardWriter = (text) => navigator.clipboard.writeText(text);
let reader: ClipboardReader = () => navigator.clipboard.readText();

/** Override (or, passing null, restore) the clipboard writer. */
export function configureClipboard(customWriter: ClipboardWriter | null): void {
  writer = customWriter ?? ((text) => navigator.clipboard.writeText(text));
}

/** Override (or, passing null, restore) the clipboard reader. */
export function configureClipboardReader(customReader: ClipboardReader | null): void {
  reader = customReader ?? (() => navigator.clipboard.readText());
}

export function writeToClipboard(text: string): Promise<void> {
  return writer(text);
}

export function readFromClipboard(): Promise<string> {
  return reader();
}
