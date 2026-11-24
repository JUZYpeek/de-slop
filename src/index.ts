import fs from 'node:fs';
import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerScanCommand } from './commands/scan.js';
import { printError } from './utils/logger.js';

export { analyzeContent, applySafeFixes, calculateCraftScore, getCraftGrade } from './analyzer/index.js';
export { runInit, parseRuleModules } from './commands/init.js';
export { scanTarget, parseCategoryFilter } from './commands/scan.js';
export type {
  AnalyzerRule,
  AutoFix,
  Category,
  CategoryCounts,
  CraftGrade,
  FileScanResult,
  Finding,
  InitFileResult,
  InitTarget,
  RuleContext,
  RuleModule,
  ScanSummary,
  Severity,
} from './types.js';

function readPackageVersion(): string {
  try {
    const pkgPath = new URL('../package.json', import.meta.url);
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'version' in parsed &&
      typeof parsed.version === 'string'
    ) {
      return parsed.version;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    printError(`Could not read package.json version: ${msg}`);
  }
  return '1.0.0';
}

export function createProgram(): Command {
  const version = readPackageVersion();
  const program = new Command();

  program
    .name('de-slop')
    .description(
      'Eliminate AI slop in UI, copywriting, motion, and code — enforce Senior Engineer & Principal Designer craft.',
    )
    .version(version, '-v, --version', 'Display CLI version')
    .showHelpAfterError();

  registerInitCommand(program, version);
  registerScanCommand(program, version);

  return program;
}

export async function run(argv: string[]): Promise<void> {
  const program = createProgram();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printError(message);
    process.exitCode = 1;
  }
}
