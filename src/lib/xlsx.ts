import { strToU8, zipSync } from 'fflate';
import type { CsvColumn } from './csv';
import { toCell, type ExportCell, type ExportValue } from './exportCells';

/**
 * A minimal single-sheet .xlsx (Office Open XML) writer. An xlsx opens
 * identically in Excel, LibreOffice/OpenOffice and Google Sheets with no
 * import dialog to get wrong — the failure mode CSV can't rule out. Only
 * what a table export needs: inline strings, numbers, dates, a bold frozen
 * header row. Text is always an inline string, never a formula, so no
 * formula-injection guard is needed here.
 *
 * Kept out of the main bundle: callers reach it through a dynamic import.
 */

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Style indexes into `STYLES_XML`'s cellXfs. */
const STYLE_HEADER = 1;
const STYLE_DATE = 2;

const STYLES_XML = `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const CONTENT_TYPES_XML = `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS_XML = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS_XML = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

/** Excel's day 0 is 1899-12-30 (the 1900 leap-year bug baked in); Unix epoch is serial 25569. */
const UNIX_EPOCH_SERIAL = 25569;
const MS_PER_DAY = 86_400_000;

// eslint-disable-next-line no-control-regex -- stripping exactly the control characters XML 1.0 forbids
const XML_INVALID_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function escapeXml(text: string): string {
  return text
    .replace(XML_INVALID_RE, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 → A, 25 → Z, 26 → AA. */
function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Excel rejects `: \ / ? * [ ]` in a sheet name and caps it at 31 characters. */
function sheetName(name: string): string {
  const clean = name
    .replace(/[:\\/?*[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
  return clean || 'Sheet1';
}

function cellXml(ref: string, cell: ExportCell, style?: number): string {
  const s = style ? ` s="${style}"` : '';
  switch (cell.kind) {
    case 'empty':
      return '';
    case 'number':
      return `<c r="${ref}"${s}><v>${cell.value}</v></c>`;
    case 'date':
      return `<c r="${ref}" s="${STYLE_DATE}"><v>${cell.value.getTime() / MS_PER_DAY + UNIX_EPOCH_SERIAL}</v></c>`;
    case 'text':
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
  }
}

/** A rough character width per column so the sheet opens readable, capped so one long note can't swamp it. */
function displayWidth(cell: ExportCell): number {
  switch (cell.kind) {
    case 'empty':
      return 0;
    case 'number':
      return String(cell.value).length;
    case 'date':
      return 19;
    case 'text':
      return cell.value.length;
  }
}

export function toXlsx<T>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
  name: string
): Uint8Array {
  const widths = columns.map((c) => c.header.length);
  const rowXml: string[] = [];

  const headerCells = columns.map((c, i) =>
    cellXml(`${columnName(i)}1`, toCell(c.header), STYLE_HEADER)
  );
  rowXml.push(`<row r="1">${headerCells.join('')}</row>`);

  rows.forEach((row, r) => {
    const rowNumber = r + 2;
    const cells = columns.map((c, i) => {
      const cell = toCell(c.value(row) as ExportValue);
      widths[i] = Math.max(widths[i], displayWidth(cell));
      return cellXml(`${columnName(i)}${rowNumber}`, cell);
    });
    rowXml.push(`<row r="${rowNumber}">${cells.join('')}</row>`);
  });

  const cols = columns.length
    ? `<cols>${widths
        .map(
          (w, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(w, 6), 60) + 2}" customWidth="1"/>`
        )
        .join('')}</cols>`
    : '';

  const sheetXml = `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rowXml.join('')}</sheetData></worksheet>`;

  const workbookXml = `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName(name))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES_XML),
    '_rels/.rels': strToU8(ROOT_RELS_XML),
    'xl/workbook.xml': strToU8(workbookXml),
    'xl/_rels/workbook.xml.rels': strToU8(WORKBOOK_RELS_XML),
    'xl/styles.xml': strToU8(STYLES_XML),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  });
}
