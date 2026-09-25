import { describe, expect, it } from 'vitest';
import { parseFittingXmlFile, parseFittingXmlText } from './fittingXmlDocument';

const SINGLE_FIT = `<?xml version="1.0"?>
<fittings>
  <fitting name="[Rifter, Solo PVP]">
    <description value="" />
    <shipType value="Rifter" />
    <hardware qty="1" slot="high slot 0" type="125mm Gatling AutoCannon II" />
    <hardware slot="high slot 0" type="Antimatter Charge S" />
    <hardware slot="low slot 0" type="Damage Control I" />
    <hardware qty="3" slot="drone bay" type="Hobgoblin I" />
    <hardware qty="50" slot="cargo hold" type="Nanite Repair Paste" />
  </fitting>
</fittings>`;

const MULTI_FIT = `<?xml version="1.0"?>
<fittings>
  <fitting name="[Rifter, Solo PVP]">
    <shipType value="Rifter" />
    <hardware slot="low slot 0" type="Damage Control I" />
  </fitting>
  <fitting name="[Punisher, Solo PVP]">
    <shipType value="Punisher" />
  </fitting>
</fittings>`;

function file(text: string, name = 'fit.xml'): File {
  return new File([text], name, { type: 'text/xml' });
}

describe('parseFittingXmlText', () => {
  it('parses a single-fit export into one entry', () => {
    const result = parseFittingXmlText(SINGLE_FIT);
    expect(result).toEqual({
      ok: true,
      document: {
        entries: [
          {
            name: '[Rifter, Solo PVP]',
            shipTypeName: 'Rifter',
            hardware: [
              { slot: 'high slot 0', type: '125mm Gatling AutoCannon II', qty: 1 },
              { slot: 'high slot 0', type: 'Antimatter Charge S' },
              { slot: 'low slot 0', type: 'Damage Control I' },
              { slot: 'drone bay', type: 'Hobgoblin I', qty: 3 },
              { slot: 'cargo hold', type: 'Nanite Repair Paste', qty: 50 },
            ],
          },
        ],
      },
    });
  });

  it('parses a multi-fit export into one entry per <fitting>', () => {
    const result = parseFittingXmlText(MULTI_FIT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.entries).toHaveLength(2);
    expect(result.document.entries.map((e) => e.name)).toEqual([
      '[Rifter, Solo PVP]',
      '[Punisher, Solo PVP]',
    ]);
  });

  it('rejects a file containing a DOCTYPE', () => {
    const withDoctype =
      '<?xml version="1.0"?><!DOCTYPE fittings [<!ENTITY x "y">]><fittings></fittings>';
    expect(parseFittingXmlText(withDoctype)).toEqual({
      ok: false,
      error: { code: 'unsupportedFormat' },
    });
  });

  it('surfaces malformed/truncated XML as an error', () => {
    const truncated = '<?xml version="1.0"?><fittings><fitting name="a"';
    expect(parseFittingXmlText(truncated)).toEqual({
      ok: false,
      error: { code: 'malformedXml' },
    });
  });

  it('rejects a non-fittings root', () => {
    expect(parseFittingXmlText('<?xml version="1.0"?><plan></plan>')).toEqual({
      ok: false,
      error: { code: 'unsupportedFormat' },
    });
  });

  it('rejects a fittings root with no <fitting> children', () => {
    expect(parseFittingXmlText('<?xml version="1.0"?><fittings></fittings>')).toEqual({
      ok: false,
      error: { code: 'empty' },
    });
  });
});

describe('parseFittingXmlFile', () => {
  it('parses a picked file', async () => {
    const result = await parseFittingXmlFile(file(SINGLE_FIT));
    expect(result.ok).toBe(true);
  });

  it('rejects an oversized file before reading it', async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    const result = await parseFittingXmlFile(new File([big], 'huge.xml'));
    expect(result).toEqual({ ok: false, error: { code: 'tooLarge' } });
  });
});
