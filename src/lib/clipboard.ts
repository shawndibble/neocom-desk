export type ClipboardWriter = (text: string) => Promise<void>;
export type ClipboardReader = () => Promise<string>;

type LaterWriter = (text: Promise<string>) => Promise<void>;

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

async function defaultWrite(text: string): Promise<void> {
  if (typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {}
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

export function configureClipboard(customWriter: ClipboardWriter | null): void {
  writer = customWriter ?? defaultWrite;
  laterWriter = customWriter ? (text) => text.then(customWriter) : defaultLaterWriter;
}

export function configureClipboardReader(customReader: ClipboardReader | null): void {
  reader = customReader ?? (() => navigator.clipboard.readText());
}

export function writeToClipboard(text: string): Promise<void> {
  return writer(text);
}

export function writeToClipboardLater(text: Promise<string>): Promise<void> {
  return laterWriter(text);
}

export function readFromClipboard(): Promise<string> {
  return reader();
}
