import path from 'node:path';
import type {
  AnalyzerRule,
  Category,
  CraftGrade,
  Finding,
  RuleContext,
  Severity,
} from '../types.js';
import { codeRules } from './codeRules.js';
import { copyRules } from './copyRules.js';
import { uiRules } from './uiRules.js';

export const ALL_RULES: readonly AnalyzerRule[] = [
  ...copyRules,
  ...uiRules,
  ...codeRules,
];

interface LineSuppression {
  all: boolean;
  ruleIds: Set<string>;
}

function parseRuleTargetList(rawTail: string): LineSuppression {
  const cleaned = rawTail
    .replace(/\*\/|-->/g, '')
    .trim();

  if (cleaned.length === 0) {
    return { all: true, ruleIds: new Set() };
  }

  const tokens = cleaned
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => /^[a-z]+\/[a-z0-9-]+$/i.test(token));

  if (tokens.length === 0) {
    return { all: true, ruleIds: new Set() };
  }

  return { all: false, ruleIds: new Set(tokens) };
}

function mergeSuppression(
  map: Map<number, LineSuppression>,
  lineNumber: number,
  incoming: LineSuppression,
): void {
  const existing = map.get(lineNumber);
  if (!existing) {
    map.set(lineNumber, incoming);
    return;
  }
  if (existing.all || incoming.all) {
    existing.all = true;
    return;
  }
  for (const id of incoming.ruleIds) {
    existing.ruleIds.add(id);
  }
}

function collectSuppressions(lines: readonly string[]): {
  ignoreFile: boolean;
  byLine: Map<number, LineSuppression>;
} {
  const headerLines = lines.slice(0, 5);
  const ignoreFile = headerLines.some((line) => /\bde-slop-ignore-file\b/.test(line));
  if (ignoreFile) {
    return { ignoreFile: true, byLine: new Map() };
  }

  const byLine = new Map<number, LineSuppression>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const nextLineMatch = /\bde-slop-ignore-next-line\b(.*)$/.exec(line);
    if (nextLineMatch) {
      mergeSuppression(byLine, i + 2, parseRuleTargetList(nextLineMatch[1] ?? ''));
      continue;
    }

    const sameLineMatch = /\bde-slop-ignore\b(.*)$/.exec(line);
    if (sameLineMatch) {
      mergeSuppression(byLine, i + 1, parseRuleTargetList(sameLineMatch[1] ?? ''));
    }
  }

  return { ignoreFile: false, byLine };
}

function isSuppressed(
  finding: Finding,
  suppressions: Map<number, LineSuppression>,
): boolean {
  const directive = suppressions.get(finding.line);
  if (!directive) {
    return false;
  }
  return directive.all || directive.ruleIds.has(finding.ruleId);
}

export function analyzeContent(
  filePath: string,
  content: string,
  categoryFilter?: Category,
): Finding[] {
  const extension = path.extname(filePath).toLowerCase();
  const lines = content.split(/\r?\n/);
  const { ignoreFile, byLine } = collectSuppressions(lines);

  if (ignoreFile) {
    return [];
  }

  const ctx: RuleContext = {
    filePath,
    extension,
    content,
    lines,
  };

  const results: Finding[] = [];

  for (const rule of ALL_RULES) {
    if (categoryFilter && rule.category !== categoryFilter) {
      continue;
    }
    if (!rule.extensions.includes(extension)) {
      continue;
    }
    const ruleFindings = rule.analyze(ctx);
    for (const finding of ruleFindings) {
      if (!isSuppressed(finding, byLine)) {
        results.push(finding);
      }
    }
  }

  results.sort((a, b) => (a.line !== b.line ? a.line - b.line : a.column - b.column));
  return results;
}

export function applySafeFixes(
  content: string,
  findings: readonly Finding[],
): { content: string; fixedCount: number } {
  const fixable = findings.filter((item) => item.fix !== undefined);
  if (fixable.length === 0) {
    return { content, fixedCount: 0 };
  }

  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const linesToDelete = new Set<number>();
  const replacementsByLine = new Map<
    number,
    Array<{ startColumn: number; endColumn: number; replacement: string }>
  >();

  for (const finding of fixable) {
    const lineIndex = finding.line - 1;
    if (lineIndex < 0 || lineIndex >= lines.length || !finding.fix) {
      continue;
    }

    if (finding.fix.kind === 'delete-line') {
      linesToDelete.add(lineIndex);
    } else {
      const list = replacementsByLine.get(lineIndex) ?? [];
      list.push({
        startColumn: finding.fix.startColumn,
        endColumn: finding.fix.endColumn,
        replacement: finding.fix.replacement,
      });
      replacementsByLine.set(lineIndex, list);
    }
  }

  let fixedCount = 0;
  const outputLines: string[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (linesToDelete.has(lineIndex)) {
      fixedCount += 1;
      continue;
    }

    let line = lines[lineIndex] ?? '';
    const lineEdits = replacementsByLine.get(lineIndex);
    if (lineEdits && lineEdits.length > 0) {
      const sorted = [...lineEdits].sort((a, b) => b.startColumn - a.startColumn);
      let earliestModified = Number.POSITIVE_INFINITY;

      for (const edit of sorted) {
        if (
          edit.startColumn < 0 ||
          edit.endColumn > line.length ||
          edit.startColumn > edit.endColumn ||
          edit.endColumn > earliestModified
        ) {
          continue;
        }
        line =
          line.slice(0, edit.startColumn) +
          edit.replacement +
          line.slice(edit.endColumn);
        earliestModified = edit.startColumn;
        fixedCount += 1;
      }
    }

    outputLines.push(line);
  }

  return {
    content: outputLines.join(eol),
    fixedCount,
  };
}

function severityWeight(severity: Severity): number {
  switch (severity) {
    case 'high':
      return 8;
    case 'medium':
      return 4;
    case 'low':
      return 2;
  }
}

export function getCraftGrade(score: number): CraftGrade {
  if (score >= 95) {
    return 'Principal Craft';
  }
  if (score >= 80) {
    return 'Senior Standard';
  }
  if (score >= 60) {
    return 'Needs Polish';
  }
  return 'AI Slop Detected';
}

export function calculateCraftScore(
  findings: readonly Finding[],
  filesScanned: number,
): { score: number; grade: CraftGrade } {
  if (findings.length === 0) {
    return { score: 100, grade: 'Principal Craft' };
  }

  let rawPenalty = 0;
  for (const finding of findings) {
    rawPenalty += severityWeight(finding.severity);
  }

  const fileScale =
    filesScanned <= 1 ? 1 : Math.max(0.5, 1 / Math.pow(filesScanned, 0.25));
  let score = Math.round(100 - rawPenalty * fileScale);

  if (score >= 100) {
    score = 99;
  }
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    grade: getCraftGrade(score),
  };
}
