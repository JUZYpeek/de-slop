import fs from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import {
  analyzeContent,
  applySafeFixes,
  calculateCraftScore,
} from '../analyzer/index.js';
import type { Category, CategoryCounts, Finding, ScanSummary } from '../types.js';
import { printError, printHeader, printScanReport } from '../utils/logger.js';

const SUPPORTED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.css',
  '.html',
  '.md',
]);

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.turbo',
  '.cache',
  'out',
  '.vercel',
]);

export interface ScanOptions {
  fix?: boolean;
  category?: Category;
}

interface RawScanCliFlags {
  fix?: boolean;
  json?: boolean;
  minScore?: string;
  category?: string;
}

function shouldSkipFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.d.ts') || lower.endsWith('.min.js') || lower.endsWith('.min.css')) {
    return true;
  }
  const ext = path.extname(lower);
  return !SUPPORTED_EXTENSIONS.has(ext);
}

async function walkDirectory(dirPath: string, collected: string[]): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        await walkDirectory(fullPath, collected);
      }
      continue;
    }

    if (entry.isFile() && !shouldSkipFile(entry.name)) {
      collected.push(fullPath);
    }
  }
}

async function collectTargetFiles(resolvedTarget: string): Promise<string[]> {
  const stats = await fs.stat(resolvedTarget);
  if (stats.isFile()) {
    const ext = path.extname(resolvedTarget).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new Error(
        `Unsupported file extension "${ext || '(none)'}". Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}`,
      );
    }
    return [resolvedTarget];
  }

  if (!stats.isDirectory()) {
    throw new Error(`Target path is neither a file nor a directory: ${resolvedTarget}`);
  }

  const files: string[] = [];
  await walkDirectory(resolvedTarget, files);
  return files;
}

export function parseCategoryFilter(raw?: string): Category | undefined {
  if (!raw || raw.trim().length === 0) {
    return undefined;
  }
  const normalized = raw.trim().toUpperCase();
  if (normalized === 'COPY' || normalized === 'UI' || normalized === 'CODE') {
    return normalized;
  }
  throw new Error(`Invalid category "${raw}". Valid categories: copy, ui, code.`);
}

function parseMinScore(raw?: string): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`Invalid --min-score "${raw}". Must be a number between 0 and 100.`);
  }
  return parsed;
}

export async function scanTarget(
  targetPaths: string | readonly string[],
  options: ScanOptions = {},
): Promise<ScanSummary> {
  const inputTargets = typeof targetPaths === 'string' ? [targetPaths] : targetPaths;
  const effectiveTargets = inputTargets.length > 0 ? inputTargets : ['.'];
  const resolvedTargets = effectiveTargets.map((item) => path.resolve(item));

  const seenFiles = new Set<string>();
  const files: string[] = [];
  for (const resolvedTarget of resolvedTargets) {
    const targetFiles = await collectTargetFiles(resolvedTarget);
    for (const filePath of targetFiles) {
      if (!seenFiles.has(filePath)) {
        seenFiles.add(filePath);
        files.push(filePath);
      }
    }
  }

  const allFindings: Finding[] = [];
  const counts: CategoryCounts = { COPY: 0, UI: 0, CODE: 0 };
  let filesWithFindings = 0;
  let totalFixed = 0;

  for (const filePath of files) {
    const originalContent = await fs.readFile(filePath, 'utf8');
    let fileFindings = analyzeContent(filePath, originalContent, options.category);

    if (options.fix && fileFindings.length > 0) {
      const { content: nextContent, fixedCount } = applySafeFixes(
        originalContent,
        fileFindings,
      );
      if (fixedCount > 0 && nextContent !== originalContent) {
        await fs.writeFile(filePath, nextContent, 'utf8');
        totalFixed += fixedCount;
        fileFindings = analyzeContent(filePath, nextContent, options.category);
      }
    }

    if (fileFindings.length > 0) {
      filesWithFindings += 1;
      for (const finding of fileFindings) {
        counts[finding.category] += 1;
        allFindings.push(finding);
      }
    }
  }

  const { score, grade } = calculateCraftScore(allFindings, files.length);
  const autoFixableRemaining = allFindings.filter((item) => item.fix !== undefined).length;

  return {
    targetPath: resolvedTargets.join(', '),
    filesScanned: files.length,
    filesWithFindings,
    findings: allFindings,
    counts,
    score,
    grade,
    fixedCount: totalFixed,
    autoFixableRemaining,
  };
}

export function registerScanCommand(program: Command, version: string): void {
  program
    .command('scan [targets...]')
    .description('Scan source files for AI slop patterns and compute a Craft Score')
    .option('--fix', 'Apply safe automated fixes (narrating comments, cliché placeholders)')
    .option('--json', 'Output scan results as JSON')
    .option('--min-score <number>', 'Exit with status 1 if Craft Score is below threshold')
    .option('-c, --category <category>', 'Filter findings by category (copy, ui, code)')
    .action(async (targets: string[] | undefined, flags: RawScanCliFlags) => {
      try {
        const category = parseCategoryFilter(flags.category);
        const minScore = parseMinScore(flags.minScore);
        const scanPaths = targets && targets.length > 0 ? targets : ['.'];

        const summary = await scanTarget(scanPaths, {
          fix: Boolean(flags.fix),
          category,
        });

        if (flags.json) {
          process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
        } else {
          printHeader('craft audit', version);
          printScanReport(summary, { cwd: process.cwd() });
        }

        if (minScore !== undefined && summary.score < minScore) {
          if (!flags.json) {
            printError(
              `Craft Score ${summary.score} is below required minimum threshold (${minScore}).`,
            );
          }
          process.exitCode = 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        printError(message);
        process.exitCode = 1;
      }
    });
}
