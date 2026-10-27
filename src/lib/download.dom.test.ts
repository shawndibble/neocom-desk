import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadTextFile } from './download';

describe('downloadTextFile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates an object URL, clicks a download anchor, and revokes the URL', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadTextFile('orders.csv', 'a,b\r\n');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // Firefox cancels an in-flight download if the URL dies in the same
    // task, so the revoke is deferred — it has not run yet.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('has the anchor in the document at click time, and removes it after', () => {
    // Firefox ignores a synthetic click on a detached anchor, so being in
    // the document during the click is the behaviour, not an artefact.
    URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
    URL.revokeObjectURL = vi.fn();
    let connectedAtClick: boolean | undefined;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      connectedAtClick = this.isConnected;
    });

    downloadTextFile('f.csv', 'x');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(connectedAtClick).toBe(true);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('sets the anchor filename', () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
    URL.revokeObjectURL = vi.fn();
    const createElement = document.createElement.bind(document);
    let anchor: HTMLAnchorElement | undefined;
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElement(tag);
      if (tag === 'a') anchor = el as HTMLAnchorElement;
      return el;
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadTextFile('report.csv', 'x');

    expect(anchor?.download).toBe('report.csv');
  });

  it('revokes the object URL even if click throws', () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
    const revokeObjectURL = vi.fn();
    URL.revokeObjectURL = revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => downloadTextFile('f.csv', 'x')).toThrow('boom');
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('defaults to text/csv;charset=utf-8', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadTextFile('f.csv', 'x');

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8');
  });
});
