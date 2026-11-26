export type DecimalMark = '.' | ',';

const SPACE_AND_APOSTROPHE = /[\s'\u2019]/g;
const SHAPE = /^-?[.,]?\d[\d.,]*$/;
const FIRST_GROUP = /^\d{1,3}$/;
const LATER_GROUP = /^\d{3}$/;

const isGrouped = (groups: string[]): boolean =>
  FIRST_GROUP.test(groups[0]) && groups.slice(1).every((group) => LATER_GROUP.test(group));

export function parseLocalizedNumber(text: string, decimal?: DecimalMark): number | null {
  const token = text.trim().replace(SPACE_AND_APOSTROPHE, '');
  if (!SHAPE.test(token)) return null;
  const sign = token.startsWith('-') ? -1 : 1;
  const unsigned = sign === -1 ? token.slice(1) : token;
  const body = /^[.,]/.test(unsigned) ? `0${unsigned}` : unsigned;

  const last = Math.max(body.lastIndexOf('.'), body.lastIndexOf(','));
  if (last === -1) return sign * Number(body);

  const mark = body[last];
  const head = body.slice(0, last);
  const tail = body.slice(last + 1);
  if (tail === '') return null;
  const other = mark === '.' ? ',' : '.';

  if (head.includes(other)) {
    if (head.includes(mark) || !isGrouped(head.split(other))) return null;
    return sign * Number(`${head.replaceAll(other, '')}.${tail}`);
  }
  if (head.includes(mark)) {
    return isGrouped([...head.split(mark), tail]) ? sign * Number(body.replaceAll(mark, '')) : null;
  }
  const thousands = tail.length === 3 && FIRST_GROUP.test(head) && head !== '0' && decimal !== mark;
  return sign * Number(thousands ? head + tail : `${head}.${tail}`);
}
