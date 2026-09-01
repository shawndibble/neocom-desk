import { describe, expect, it } from 'vitest';
import { parseItemDescription } from './itemDescription';

describe('parseItemDescription', () => {
  it('returns plain text untouched as a single run', () => {
    const runs = parseItemDescription(
      'This drone has been augmented with so many rogue drone parts that it is unrecognizable from its original design.'
    );
    expect(runs).toEqual([
      {
        text: 'This drone has been augmented with so many rogue drone parts that it is unrecognizable from its original design.',
        bold: false,
        italic: false,
        underline: false,
      },
    ]);
  });

  it('bolds text wrapped in <font size><b>, dropping the font tag entirely', () => {
    const runs = parseItemDescription('<font size="14"><b>Heading</b></font>\n\nBody text.');
    expect(runs).toEqual([
      { text: 'Heading', bold: true, italic: false, underline: false },
      { text: '\n\nBody text.', bold: false, italic: false, underline: false },
    ]);
  });

  it('italicizes text wrapped in <i>', () => {
    const runs = parseItemDescription('<i>Legal disclaimer text.</i>');
    expect(runs).toEqual([
      { text: 'Legal disclaimer text.', bold: false, italic: true, underline: false },
    ]);
  });

  it('underlines text wrapped in <u>', () => {
    const runs = parseItemDescription('<u>Important</u>');
    expect(runs).toEqual([{ text: 'Important', bold: false, italic: false, underline: true }]);
  });

  it('turns <br> and <br/> into newlines', () => {
    const runs = parseItemDescription('Line one<br>Line two<br/>Line three');
    expect(runs).toEqual([
      { text: 'Line one\nLine two\nLine three', bold: false, italic: false, underline: false },
    ]);
  });

  it('keeps the label text of a showinfo link and drops the tag', () => {
    const runs = parseItemDescription(
      'See <a href="showinfo:962//1234">Paragon Hub</a> for details.'
    );
    expect(runs).toEqual([
      { text: 'See Paragon Hub for details.', bold: false, italic: false, underline: false },
    ]);
  });

  it('decodes HTML entities', () => {
    const runs = parseItemDescription(
      'Tom &amp; Jerry &lt;3 &gt; 2 &quot;quoted&quot; &#39;s&#39;'
    );
    expect(runs).toEqual([
      { text: `Tom & Jerry <3 > 2 "quoted" 's'`, bold: false, italic: false, underline: false },
    ]);
  });

  it('strips unrecognized tags while keeping their inner text', () => {
    const runs = parseItemDescription('<color=#ff0000>Warning</color>');
    expect(runs).toEqual([{ text: 'Warning', bold: false, italic: false, underline: false }]);
  });

  it('parses the Brand Manager Expert System description end to end', () => {
    const raw = `<font size="14"><b>Brand Manager Expert System</b></font>

This Expert System makes available skills enabling corporation Brand Managers and other Capsuleers to efficiently sequence SKINs and manage Paragon Hub.

An Expert System is a remote, restricted artificial intelligence providing you with access to certain skills during the active rental period. As it is independent from your clone and your capsule, an active Expert System is not lost on pod death or clone jump.

<font size="14"><b>Activating an Expert System</b></font>

Activation of an Expert System is automatic upon redemption of the item by the specific capsuleer intending to use the service.

<i>Expert Systems are a product developed by the PKN Interstellar consortium, made available over the HyperNet FTL communications network, and marketed by PKN Interstellar member corporations.</i>`;

    const runs = parseItemDescription(raw);

    expect(runs.some((r) => r.bold && r.text === 'Brand Manager Expert System')).toBe(true);
    expect(runs.some((r) => r.bold && r.text === 'Activating an Expert System')).toBe(true);
    expect(
      runs.some((r) => r.italic && r.text.startsWith('Expert Systems are a product developed'))
    ).toBe(true);
    // No raw tag text ever leaks into a run.
    for (const run of runs) {
      expect(run.text).not.toMatch(/<[a-zA-Z/][^>]*>/);
    }
  });

  it('handles an empty description', () => {
    expect(parseItemDescription('')).toEqual([]);
  });
});
