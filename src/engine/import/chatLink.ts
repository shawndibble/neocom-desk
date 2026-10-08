/**
 * Reads an in-game chat link off a paste: `<url=showinfo:TYPE>…</url>` (an
 * item or ship type) or `<url=showinfo:5//SYSTEM_ID>…</url>` (a solar system),
 * or the bare `showinfo:…` text form. Only those two kinds have a page in the
 * app; corporations, characters, killmails and any other `showinfo:` link are
 * skipped, and the first recognised link wins.
 *
 * Pure: the router (`app/GlobalPasteRouter.tsx`) decides where each opens.
 */

export type ChatLink = { kind: 'type'; id: number } | { kind: 'system'; id: number };

/** The `showinfo` type id CCP gives a solar system. */
const SOLAR_SYSTEM_TYPE_ID = 5;

const SHOWINFO = /showinfo:(\d+)(?:\/\/(\d+))?(?![\d/])/gi;

function positiveId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function parseChatLink(text: string): ChatLink | null {
  for (const [, typeRaw, targetRaw] of text.matchAll(SHOWINFO)) {
    const typeId = positiveId(typeRaw);
    if (typeId === null) continue;
    if (targetRaw === undefined) return { kind: 'type', id: typeId };
    if (typeId !== SOLAR_SYSTEM_TYPE_ID) continue;
    const systemId = positiveId(targetRaw);
    if (systemId !== null) return { kind: 'system', id: systemId };
  }
  return null;
}
