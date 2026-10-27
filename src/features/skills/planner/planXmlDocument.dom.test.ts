import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parsePlanXmlFile } from './planXmlDocument';

const FIXTURES = join(__dirname, '__fixtures__');

function fileFrom(name: string, mime = 'application/octet-stream'): File {
  const bytes = readFileSync(join(FIXTURES, name));
  return new File([bytes], name, { type: mime });
}

const EXPECTED_ENTRIES = [
  { skillName: 'Gunnery', skillID: 3300, level: 4, priority: 3 },
  { skillName: 'Spaceship Command', skillID: 3327, level: 3, priority: 2 },
  { skillName: 'Caldari Frigate', skillID: 3335, level: 5, priority: 1 },
];

describe('parsePlanXmlFile', () => {
  it('parses a plain .xml export to the intermediate document shape', async () => {
    const result = await parsePlanXmlFile(fileFrom('sample-plan.xml', 'text/xml'));
    expect(result).toEqual({
      ok: true,
      document: { name: 'Sample Plan', entries: EXPECTED_ENTRIES },
    });
  });

  it('parses a gzip .emp export (real EVEMon plan-XML schema, gzip-compressed) to the same shape', async () => {
    const result = await parsePlanXmlFile(fileFrom('sample-plan.emp'));
    expect(result).toEqual({
      ok: true,
      document: { name: 'Sample Plan', entries: EXPECTED_ENTRIES },
    });
  });

  it('rejects a file containing a DOCTYPE', async () => {
    const withDoctype = '<?xml version="1.0"?><!DOCTYPE plan [<!ENTITY x "y">]><plan></plan>';
    const file = new File([withDoctype], 'evil.xml', { type: 'text/xml' });
    const result = await parsePlanXmlFile(file);
    expect(result).toEqual({ ok: false, error: { code: 'unsupportedFormat' } });
  });

  it('rejects an oversized compressed file before reading it', async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    const file = new File([big], 'huge.emp');
    const result = await parsePlanXmlFile(file);
    expect(result).toEqual({ ok: false, error: { code: 'tooLarge' } });
  });

  it('surfaces malformed/truncated XML as an error, not a silent empty result', async () => {
    const truncated = '<?xml version="1.0"?><plan><entry skill="Gunnery" level="4"';
    const file = new File([truncated], 'truncated.xml', { type: 'text/xml' });
    const result = await parsePlanXmlFile(file);
    expect(result).toEqual({ ok: false, error: { code: 'malformedXml' } });
  });

  it('surfaces a <plans>-rooted (multi-plan .epb) file as its own error', async () => {
    const batch = '<?xml version="1.0"?><plans><plan name="A"></plan></plans>';
    const file = new File([batch], 'backup.epb', { type: 'text/xml' });
    const result = await parsePlanXmlFile(file);
    expect(result).toEqual({ ok: false, error: { code: 'multiPlanUnsupported' } });
  });

  it('rejects a document whose root is neither plan nor plans', async () => {
    const notAPlan = '<?xml version="1.0"?><fitting></fitting>';
    const file = new File([notAPlan], 'fit.xml', { type: 'text/xml' });
    const result = await parsePlanXmlFile(file);
    expect(result).toEqual({ ok: false, error: { code: 'unsupportedFormat' } });
  });
});
