import { strToU8, zipSync } from 'fflate';
import type { CsvColumn } from './csv';
import { MAX_CELL_TEXT, toCell, type ExportCell, type ExportValue } from './exportCells';
import { DAY_MS } from '@/lib/age';

/**
 * A minimal .xlsx (Office Open XML) writer: one sheet for a table export, or
 * a sheet per record type for a whole-dataset export. An xlsx opens
 * identically in Excel, LibreOffice/OpenOffice and Google Sheets with no
 * import dialog to get wrong — the failure mode CSV can't rule out. Only
 * what an export needs: inline strings, numbers, dates, a bold frozen
 * header row. Text is always an inline string, never a formula, so no
 * formula-injection guard is needed here.
 *
 * `resolveSheet` reads cells off the rows; `writeWorkbook` turns plain cells into the file
 * (`xlsxBuild` runs it in a worker). Kept out of the main bundle: dynamic import only.
 */

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Style indexes into `STYLES_XML`'s cellXfs. */
const STYLE_HEADER = 1;
const STYLE_DATE = 2;

const STYLES_XML = `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const ROOT_RELS_XML = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

/** Excel's day 0 is 1899-12-30 (the 1900 leap-year bug baked in); Unix epoch is serial 25569. */
const UNIX_EPOCH_SERIAL = 25569;

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

/** Excel refuses a workbook whose sheet names repeat, case aside: later ones get " (2)", " (3)". */
function uniqueSheetNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((raw) => {
    const base = sheetName(raw);
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      name = base.slice(0, 31 - suffix.length).trimEnd() + suffix;
    }
    taken.add(name.toLowerCase());
    return name;
  });
}

function cellXml(ref: string, cell: ExportCell, style?: number): string {
  const s = style ? ` s="${style}"` : '';
  switch (cell.kind) {
    case 'empty':
      return '';
    case 'number':
      return `<c r="${ref}"${s}><v>${cell.value}</v></c>`;
    case 'date':
      return `<c r="${ref}" s="${STYLE_DATE}"><v>${cell.value.getTime() / DAY_MS + UNIX_EPOCH_SERIAL}</v></c>`;
    case 'text':
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value.slice(0, MAX_CELL_TEXT))}</t></is></c>`;
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

export interface XlsxSheet<T> {
  name: string;
  rows: readonly T[];
  columns: readonly CsvColumn<T>[];
}

/** A sheet with every cell already read off its row: plain data a worker can be posted. */
export interface PlainSheet {
  name: string;
  headers: string[];
  rows: ExportValue[][];
}

export function resolveSheet<T>({ name, rows, columns }: XlsxSheet<T>): PlainSheet {
  return {
    name,
    headers: columns.map((c) => c.header),
    rows: rows.map((row) => columns.map((c) => c.value(row))),
  };
}

function worksheetXml({ headers, rows }: PlainSheet): string {
  const widths = headers.map((h) => h.length);
  const letters = headers.map((_, i) => columnName(i));
  const rowXml: string[] = [];

  const headerCells = headers.map((h, i) => cellXml(`${letters[i]}1`, toCell(h), STYLE_HEADER));
  rowXml.push(`<row r="1">${headerCells.join('')}</row>`);

  rows.forEach((values, r) => {
    const rowNumber = r + 2;
    const cells = headers.map((_, i) => {
      const cell = toCell(values[i]);
      widths[i] = Math.max(widths[i], displayWidth(cell));
      return cellXml(`${letters[i]}${rowNumber}`, cell);
    });
    rowXml.push(`<row r="${rowNumber}">${cells.join('')}</row>`);
  });

  const cols = headers.length
    ? `<cols>${widths
        .map(
          (w, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(w, 6), 60) + 2}" customWidth="1"/>`
        )
        .join('')}</cols>`
    : '';

  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rowXml.join('')}</sheetData></worksheet>`;
}

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const SHEET_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the row type is invariant per sheet
export type AnyXlsxSheet = XlsxSheet<any>;

/** A workbook with a sheet per entry, in order, built in one go on the calling thread. */
export function toXlsxWorkbook(sheets: readonly AnyXlsxSheet[]): Uint8Array {
  return writeWorkbook(sheets.map(resolveSheet));
}

/**
 * The file for sheets already resolved; pure, so the worker and the page write the same file.
 * Sheet `i` is `sheet{i+1}.xml` on relationship `rId{i+1}`; styles take the id after the last.
 */
export function writeWorkbook(sheets: readonly PlainSheet[]): Uint8Array {
  const names = uniqueSheetNames(sheets.map((s) => s.name));
  const n = sheets.length;
  const overrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${SHEET_TYPE}"/>`
    )
    .join('');
  const contentTypes = `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const sheetRels = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('');
  const workbookRels = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`;
  const sheetEntries = names
    .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  const workbookXml = `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets>${sheetEntries}</sheets></workbook>`;

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(ROOT_RELS_XML),
    'xl/workbook.xml': strToU8(workbookXml),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/styles.xml': strToU8(STYLES_XML),
  };
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(worksheetXml(sheet));
  });
  return zipSync(files);
}

/** A one-sheet workbook: what a table export writes. */
export function toXlsx<T>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
  name: string
): Uint8Array {
  return toXlsxWorkbook([{ name, rows, columns }]);
}
