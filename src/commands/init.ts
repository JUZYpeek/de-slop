import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import type { InitFileResult, InitTarget, RuleModule } from '../types.js';
import { printError, printHeader, printInfo, printInitReport } from '../utils/logger.js';

const TEMPLATES_DIR = fileURLToPath(new URL('../../templates', import.meta.url));
const START_MARKER = '<!-- de-slop:start -->';
const END_MARKER = '<!-- de-slop:end -->';

const TARGET_FILE_MAP: Record<InitTarget, string> = {
  cursor: '.cursorrules',
  claude: 'CLAUDE.md',
  antigravity: path.join('.antigravity', 'rules.md'),
  gemini: path.join('.gemini', 'styleguide.md'),
};

const MODULE_TEMPLATE_MAP: Record<RuleModule, string> = {
  base: 'base-craft.md',
  ui: 'ui-and-motion.md',
  copy: 'human-copy.md',
  code: 'senior-code.md',
};

const ALL_TARGETS: readonly InitTarget[] = ['cursor', 'claude', 'antigravity', 'gemini'];
const ALL_MODULES: readonly RuleModule[] = ['base', 'ui', 'copy', 'code'];

export interface InitOptions {
  cwd?: string;
  targets?: readonly InitTarget[];
  modules?: readonly RuleModule[];
}

interface RawInitCliFlags {
  cursor?: boolean;
  claude?: boolean;
  antigravity?: boolean;
  gemini?: boolean;
  all?: boolean;
  dir?: string;
  rules?: string;
}

export function parseRuleModules(raw?: string): RuleModule[] {
  if (!raw || raw.trim().length === 0) {
    return [...ALL_MODULES];
  }

  const parsed: RuleModule[] = [];
  for (const part of raw.split(',')) {
    const normalized = part.trim().toLowerCase();
    if (normalized.length === 0) {
      continue;
    }
    if (
      normalized !== 'base' &&
      normalized !== 'ui' &&
      normalized !== 'copy' &&
      normalized !== 'code'
    ) {
      throw new Error(
        `Unknown rule module "${normalized}". Valid modules: base, ui, copy, code.`,
      );
    }
    if (!parsed.includes(normalized)) {
      parsed.push(normalized);
    }
  }

  if (parsed.length === 0) {
    throw new Error('At least one rule module must be specified (base, ui, copy, code).');
  }

  return parsed;
}

async function buildManagedBlock(modules: readonly RuleModule[]): Promise<string> {
  const sections: string[] = [];

  for (const mod of modules) {
    const fileName = MODULE_TEMPLATE_MAP[mod];
    const templatePath = path.join(TEMPLATES_DIR, fileName);
    const content = await fs.readFile(templatePath, 'utf8');
    sections.push(content.trim());
  }

  return [
    START_MARKER,
    '<!-- Managed by de-slop. Keep custom project rules outside these markers. -->',
    '',
    sections.join('\n\n---\n\n'),
    '',
    END_MARKER,
  ].join('\n');
}

function mergeManagedBlock(
  existingContent: string | null,
  managedBlock: string,
): { nextContent: string; status: InitFileResult['status'] } {
  if (existingContent === null) {
    return {
      nextContent: `${managedBlock}\n`,
      status: 'created',
    };
  }

  const startIdx = existingContent.indexOf(START_MARKER);
  const endIdx = existingContent.indexOf(END_MARKER);

  if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    const before = existingContent.slice(0, startIdx);
    const after = existingContent.slice(endIdx + END_MARKER.length);
    const combined = `${before}${managedBlock}${after}`;
    const normalized = combined.endsWith('\n') ? combined : `${combined}\n`;
    return {
      nextContent: normalized,
      status: 'updated',
    };
  }

  const trimmedEnd = existingContent.trimEnd();
  if (trimmedEnd.length === 0) {
    return {
      nextContent: `${managedBlock}\n`,
      status: 'merged',
    };
  }

  return {
    nextContent: `${trimmedEnd}\n\n${managedBlock}\n`,
    status: 'merged',
  };
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

export async function runInit(options: InitOptions): Promise<InitFileResult[]> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const targets = options.targets ?? ALL_TARGETS;
  const modules = options.modules ?? ALL_MODULES;

  if (targets.length === 0) {
    throw new Error('Select at least one target configuration file.');
  }

  const managedBlock = await buildManagedBlock(modules);
  const results: InitFileResult[] = [];

  for (const target of targets) {
    const relativeTarget = TARGET_FILE_MAP[target];
    const targetPath = path.join(cwd, relativeTarget);
    const existing = await readIfExists(targetPath);
    const { nextContent, status } = mergeManagedBlock(existing, managedBlock);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, nextContent, 'utf8');

    results.push({
      target,
      filePath: targetPath,
      status,
    });
  }

  return results;
}

function parseTargetSelection(raw: string): InitTarget[] {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === '' || trimmed === '5' || trimmed === 'all') {
    return [...ALL_TARGETS];
  }

  const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  const selected: InitTarget[] = [];

  for (const token of tokens) {
    let resolved: InitTarget | null = null;
    if (token === '1' || token === 'cursor') {
      resolved = 'cursor';
    } else if (token === '2' || token === 'claude') {
      resolved = 'claude';
    } else if (token === '3' || token === 'antigravity') {
      resolved = 'antigravity';
    } else if (token === '4' || token === 'gemini') {
      resolved = 'gemini';
    } else if (token === '5' || token === 'all') {
      return [...ALL_TARGETS];
    }

    if (!resolved) {
      throw new Error(`Invalid selection "${token}". Choose numbers 1–5 separated by commas.`);
    }
    if (!selected.includes(resolved)) {
      selected.push(resolved);
    }
  }

  return selected;
}

async function promptForTargets(): Promise<InitTarget[]> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    process.stdout.write('Select AI rule targets to install (comma-separated, default 5):\n');
    process.stdout.write('  1. Cursor       (.cursorrules)\n');
    process.stdout.write('  2. Claude Code  (CLAUDE.md)\n');
    process.stdout.write('  3. Antigravity  (.antigravity/rules.md)\n');
    process.stdout.write('  4. Gemini       (.gemini/styleguide.md)\n');
    process.stdout.write('  5. All targets  (default)\n\n');

    const answer = await rl.question('Targets [5]: ');
    process.stdout.write('\n');
    return parseTargetSelection(answer);
  } finally {
    rl.close();
  }
}

function resolveTargetsFromFlags(flags: RawInitCliFlags): InitTarget[] {
  if (flags.all) {
    return [...ALL_TARGETS];
  }

  const selected: InitTarget[] = [];
  if (flags.cursor) {
    selected.push('cursor');
  }
  if (flags.claude) {
    selected.push('claude');
  }
  if (flags.antigravity) {
    selected.push('antigravity');
  }
  if (flags.gemini) {
    selected.push('gemini');
  }
  return selected;
}

export function registerInitCommand(program: Command, version: string): void {
  program
    .command('init')
    .description('Install and merge senior craft rules into AI editor configs')
    .option('--cursor', 'Write rules to .cursorrules')
    .option('--claude', 'Write rules to CLAUDE.md')
    .option('--antigravity', 'Write rules to .antigravity/rules.md')
    .option('--gemini', 'Write rules to .gemini/styleguide.md')
    .option('--all', 'Write rules to all supported config files')
    .option('-d, --dir <path>', 'Target project directory', process.cwd())
    .option(
      '-r, --rules <list>',
      'Comma-separated rule modules (base,ui,copy,code)',
      'base,ui,copy,code',
    )
    .action(async (flags: RawInitCliFlags) => {
      try {
        printHeader('initialize craft rules', version);

        const cwd = path.resolve(flags.dir ?? process.cwd());
        const modules = parseRuleModules(flags.rules);
        let targets = resolveTargetsFromFlags(flags);

        if (targets.length === 0) {
          if (process.stdin.isTTY && process.stdout.isTTY) {
            targets = await promptForTargets();
          } else {
            printInfo(
              'Specify at least one target flag (--cursor, --claude, --antigravity, --gemini, or --all).',
            );
            process.exitCode = 1;
            return;
          }
        }

        const results = await runInit({ cwd, targets, modules });
        printInitReport(results, cwd);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        printError(message);
        process.exitCode = 1;
      }
    });
}
