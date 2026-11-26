export interface EftParseError {
  line: number;
  text: string;
  reason: string;
}

export interface EftItem {
  name: string;
  quantity: number;
  isCharge?: true;
  line: number;
  mutationRef?: number;
}

export interface EftMutationBlock {
  ref: number;
  line: number;
  baseName: string;
  mutaplasmidName?: string;
  attributes: { name: string; value: number }[];
}

export interface EftFit {
  shipName: string;
  fitName: string;
  headerLine: number;
  items: EftItem[];
  mutations: EftMutationBlock[];
  errors: EftParseError[];
}

const HEADER = /^\[\s*([^\s,\]][^,\]]*?)\s*(?:,\s*(.*?)\s*)?\]$/;
const EMPTY_SLOT = /^\[Empty\s+.+\s+slot\]$/i;
const OFFLINE_SUFFIX = /\s*\/offline\s*$/i;
const QUANTITY_SUFFIX = /^(.*\S)\s+x(\d+)$/i;
export const MUTATION_REF_SUFFIX = /\s*\[(\d+)\]$/;
const MUTATION_BLOCK_HEADER = /^\[(\d+)\]\s*(.*)$/;

function parseRolls(line: string): { name: string; value: number }[] {
  const rolls: { name: string; value: number }[] = [];
  for (const pair of line.split(',')) {
    const [name, valueStr, ...rest] = pair.trim().split(/\s+/);
    if (!name || valueStr === undefined || rest.length > 0) continue;
    const value = Number(valueStr);
    if (valueStr === '' || !Number.isFinite(value)) continue;
    rolls.push({ name, value });
  }
  return rolls;
}

export function looksLikeEftFit(text: string): boolean {
  const first = text.split(/\r\n|\r|\n/).find((line) => line.trim() !== '');
  return first !== undefined && first.trim().startsWith('[');
}

export function parseEftFit(text: string): EftFit {
  const lines = text.split(/\r\n|\r|\n/);
  const errors: EftParseError[] = [];
  const items: EftItem[] = [];

  let shipName = '';
  let fitName = '';

  const headerIndex = lines.findIndex((l) => l.trim() !== '');
  const headerLine = headerIndex === -1 ? 1 : headerIndex + 1;
  const headerText = headerIndex === -1 ? '' : lines[headerIndex].trim();
  const headerMatch = EMPTY_SLOT.test(headerText) ? null : HEADER.exec(headerText);
  if (headerMatch) {
    shipName = headerMatch[1];
    fitName = headerMatch[2] ?? '';
  } else {
    errors.push({
      line: headerLine,
      text: headerText,
      reason: 'invalid or missing fit header, expected "[Ship Name]" or "[Ship Name, Fit Name]"',
    });
  }

  const mutations: EftMutationBlock[] = [];
  let block: EftMutationBlock | null = null;

  const bodyStart = headerIndex === -1 ? lines.length : headerIndex + 1;
  for (let i = bodyStart; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') {
      block = null;
      continue;
    }
    if (EMPTY_SLOT.test(trimmed)) continue;

    const blockHeader = MUTATION_BLOCK_HEADER.exec(trimmed);
    if (blockHeader) {
      block = {
        ref: Number(blockHeader[1]),
        line: i + 1,
        baseName: blockHeader[2].trim(),
        attributes: [],
      };
      mutations.push(block);
      continue;
    }
    if (block && block.mutaplasmidName === undefined) {
      block.mutaplasmidName = trimmed;
      continue;
    }
    if (block) {
      const rolls = parseRolls(trimmed);
      const current = block;
      block = null;
      if (rolls.length > 0) {
        current.attributes = rolls;
        continue;
      }
    }

    const refMatch = MUTATION_REF_SUFFIX.exec(trimmed);
    const mutationRef = refMatch ? Number(refMatch[1]) : undefined;
    const withoutRef = refMatch ? trimmed.slice(0, refMatch.index) : trimmed;
    const withoutOffline = withoutRef.replace(OFFLINE_SUFFIX, '').trim();
    const qtyMatch = QUANTITY_SUFFIX.exec(withoutOffline);
    const quantity = qtyMatch ? Number(qtyMatch[2]) : 1;
    const body = qtyMatch ? qtyMatch[1] : withoutOffline;

    const [modulePart, chargePart] = body.split(',').map((s) => s.trim());
    if (!modulePart) {
      errors.push({ line: i + 1, text: trimmed, reason: 'unparseable item line' });
      continue;
    }
    items.push({
      name: modulePart,
      quantity,
      line: i + 1,
      ...(mutationRef === undefined ? {} : { mutationRef }),
    });
    if (chargePart) items.push({ name: chargePart, quantity, line: i + 1, isCharge: true });
  }

  return { shipName, fitName, headerLine, items, mutations, errors };
}
