/**
 * Triggers a browser download of `text` as a file. Not pure — touches the
 * DOM.
 *
 * Two non-obvious requirements, both browser bugs-by-design rather than
 * preference: the anchor must be *in the document* for Firefox to act on a
 * synthetic click, and the object URL must outlive the click — Firefox
 * cancels an in-flight download if the URL is revoked in the same task, so
 * the revoke is deferred rather than run in a `finally`.
 */
export function downloadTextFile(
  filename: string,
  text: string,
  mimeType = 'text/csv;charset=utf-8'
): void {
  downloadBlob(filename, new Blob([text], { type: mimeType }));
}

/** `downloadTextFile` for any content — the binary xlsx export goes through here. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  let anchor: HTMLAnchorElement | undefined;
  try {
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor?.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
