import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

const eslint = new ESLint();

async function deepErrors(source, filePath) {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter(
    (m) => m.ruleId === 'no-restricted-imports' && m.message.includes('Improve engine')
  );
}

describe('Improve engine seam lint guard', () => {
  it.each([
    ["import { x } from '@/engine/fittings/improve/improveKeys';", 'src/features/fittings/a.ts'],
    ["import { x } from '@/engine/fittings/improve/improve';", 'src/features/miningTax/a.ts'],
    ["import { x } from './improve/improveJob';", 'src/engine/fittings/hullCommonality.ts'],
    ["import { x } from '../improve/improveJob';", 'src/engine/fittings/other/a.ts'],
  ])('fires on %s', async (source, filePath) => {
    expect(await deepErrors(`${source}\nexport const y = x;\n`, filePath)).toHaveLength(1);
  });

  it('allows the folder index', async () => {
    const source = "import { x } from '@/engine/fittings/improve';\nexport const y = x;\n";
    expect(await deepErrors(source, 'src/features/fittings/a.ts')).toHaveLength(0);
  });

  it('allows sibling imports inside the folder', async () => {
    const source = "import { x } from './improveKeys';\nexport const y = x;\n";
    expect(await deepErrors(source, 'src/engine/fittings/improve/improve.ts')).toHaveLength(0);
  });
});
