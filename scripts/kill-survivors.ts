import * as dotenv from 'dotenv';
dotenv.config();

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

interface MutantLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

interface Mutant {
  id: string;
  mutatorName: string;
  replacement: string;
  original?: string;
  location: MutantLocation;
  status: string;
  description?: string;
}

interface StrykerFile {
  mutants: Mutant[];
  source: string;
}

interface StrykerReport {
  files: Record<string, StrykerFile>;
}

function loadSurvivedMutants(): { mutants: Mutant[]; sourceCode: string } {
  const reportPath = path.join(__dirname, '..', 'reports', 'mutation', 'mutation.json');
  const report: StrykerReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

  const sourcePath = Object.keys(report.files)[0];
  const fileData = report.files[sourcePath];
  const survived = fileData.mutants.filter((m) => m.status === 'Survived');

  return { mutants: survived, sourceCode: fileData.source };
}

function loadExistingTests(): string {
  const testPath = path.join(__dirname, '..', 'tests', 'transferValidator.test.ts');
  return fs.readFileSync(testPath, 'utf-8');
}

function buildPrompt(mutants: Mutant[], sourceCode: string, existingTests: string): string {
  const mutantList = mutants
    .map(
      (m) =>
        `- ID ${m.id} | ${m.mutatorName} | línea ${m.location.start.line}
   Original:    ${m.original ?? '(ver código)'}
   Reemplazado: ${m.replacement}`,
    )
    .join('\n\n');

  return `Eres un experto en testing de software. Tu tarea es escribir tests unitarios en TypeScript (Jest) que maten mutantes concretos que han sobrevivido a una ejecución de Stryker.

## Código fuente bajo test

\`\`\`typescript
${sourceCode}
\`\`\`

## Tests existentes (ya ejecutados, NO los repitas)

\`\`\`typescript
${existingTests}
\`\`\`

## Mutantes supervivientes a matar

${mutantList}

## Instrucciones

1. Para cada mutante, escribe exactamente UN test que lo mate.
2. El test debe FALLAR con el mutante y PASAR con el código original.
3. Agrupa los tests en un bloque \`describe('Mutant killers', ...)\`.
4. Usa los mismos imports y helpers del fichero de tests existente.
5. Para los mutantes de Regex: usa IBANs que validen el patrón exacto que se rompe (longitud concreta, caracteres concretos).
6. Para EqualityOperator en límites: testea el valor EXACTO del límite (0.01, 50000, 10000, saldo == importe).
7. Para StringLiteral: comprueba el texto exacto del mensaje de error.
8. NO incluyas imports duplicados ni el bloque \`describe\` externo de los tests ya existentes.
9. Devuelve SOLO el código TypeScript, sin explicaciones adicionales, sin bloques de markdown.`;
}

async function generateKillerTests(): Promise<void> {
  const client = new Anthropic();

  console.log('📂 Cargando mutantes supervivientes...');
  const { mutants, sourceCode } = loadSurvivedMutants();
  const existingTests = loadExistingTests();

  console.log(`🧬 ${mutants.length} mutantes supervivientes encontrados`);
  mutants.forEach((m) =>
    console.log(`   #${m.id} ${m.mutatorName} (línea ${m.location.start.line}): ${m.replacement}`),
  );

  console.log('\n🤖 Llamando a Claude para generar los tests...\n');

  const prompt = buildPrompt(mutants, sourceCode, existingTests);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const generatedCode = (message.content[0] as { type: string; text: string }).text;

  const outputPath = path.join(__dirname, '..', 'tests', 'transferValidator.killers.test.ts');

  const fileContent = `// ─────────────────────────────────────────────────────────────────────────────
// Tests generados por Claude para matar mutantes supervivientes de Stryker
// Script: scripts/kill-survivors.ts
// ─────────────────────────────────────────────────────────────────────────────

import {
  validateIBAN,
  validateAmount,
  hasSufficientBalance,
  exceedsDailyLimit,
  validateTransfer,
  Account,
  Transfer,
} from '../src/transferValidator';

const baseAccount: Account = {
  id: 'ACC-001',
  balance: 5000,
  currency: 'EUR',
  dailyTransferredAmount: 0,
};

const validTransfer: Transfer = {
  fromAccount: baseAccount,
  toIBAN: 'ES7620770024003102575766',
  amount: 100,
  currency: 'EUR',
};

${generatedCode}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf-8');

  console.log(`✅ Tests generados en: tests/transferValidator.killers.test.ts`);
  console.log(`\n📊 Tokens usados: ${message.usage.input_tokens} entrada / ${message.usage.output_tokens} salida`);
}

generateKillerTests().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
