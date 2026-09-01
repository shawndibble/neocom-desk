/**
 * Injectable clipboard writer, mirroring src/esi/client's configureEsi
 * pattern: production code goes through the real Clipboard API, tests inject
 * a spy (jsdom has no usable navigator.clipboard).
 */
export type ClipboardWriter = (text: string) => Promise<void>;

let writer: ClipboardWriter = (text) => navigator.clipboard.writeText(text);

/** Override (or, passing null, restore) the clipboard writer. */
export function configureClipboard(customWriter: ClipboardWriter | null): void {
  writer = customWriter ?? ((text) => navigator.clipboard.writeText(text));
}

export function writeToClipboard(text: string): Promise<void> {
  return writer(text);
}
