import path from 'node:path';
import pc from 'picocolors';
import type {
  Category,
  CraftGrade,
  Finding,
  InitFileResult,
  ScanSummary,
  Severity,
} from '../types.js';

function writeLine(stream: NodeJS.WriteStream, text = ''): void {
  stream.write(`${text}\n`);
}

function toDisplayPath(cwd: string, filePath: string): string {
  const relative = path.relative(cwd, filePath).replace(/\\/g, '/');
  if (relative === '') {
    return path.basename(filePath);
  }
  return relative;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function formatCategoryBadge(category: Category): string {
  switch (category) {
    case 'COPY':
      return pc.magenta('[COPY]');
    case 'UI':
      return pc.cyan('[UI]  ');
    case 'CODE':
      return pc.blue('[CODE]');
  }
}

function formatSeverity(severity: Severity): string {
  switch (severity) {
    case 'high':
      return pc.red('high');
    case 'medium':
      return pc.yellow('med ');
    case 'low':
      return pc.dim('low ');
  }
}

function colorizeByScore(score: number, text: string): string {
  if (score >= 90) {
    return pc.green(text);
  }
  if (score >= 70) {
    return pc.yellow(text);
  }
  return pc.red(text);
}

function renderScoreBar(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  const filledCount = Math.round((clamped / 100) * 20);
  const emptyCount = 20 - filledCount;
  const filled = '█'.repeat(filledCount);
  const empty = '░'.repeat(emptyCount);
  return `${colorizeByScore(clamped, filled)}${pc.dim(empty)}`;
}

function formatGrade(score: number, grade: CraftGrade): string {
  return colorizeByScore(score, grade);
}

function groupFindingsByFile(findings: readonly Finding[]): Map<string, Finding[]> {
  const grouped = new Map<string, Finding[]>();
  for (const finding of findings) {
    const existing = grouped.get(finding.filePath);
    if (existing) {
      existing.push(finding);
    } else {
      grouped.set(finding.filePath, [finding]);
    }
  }
  return grouped;
}

export function printHeader(subtitle: string, version: string): void {
  writeLine(process.stdout);
  writeLine(
    process.stdout,
    `${pc.bold('de-slop')} ${pc.dim(`v${version}`)}  ${pc.dim('·')}  ${pc.dim(subtitle)}`,
  );
  writeLine(process.stdout);
}

export function printScanReport(summary: ScanSummary, options: { cwd: string }): void {
  const grouped = groupFindingsByFile(summary.findings);

  if (summary.findings.length === 0) {
    writeLine(
      process.stdout,
      `  ${pc.green('OK')}  No AI slop patterns found across ${summary.filesScanned} file${summary.filesScanned === 1 ? '' : 's'}.`,
    );
    writeLine(process.stdout);
  } else {
    for (const [filePath, fileFindings] of grouped.entries()) {
      const displayPath = toDisplayPath(options.cwd, filePath);
      const countLabel = `${fileFindings.length} issue${fileFindings.length === 1 ? '' : 's'}`;
      writeLine(process.stdout, `${pc.bold(pc.underline(displayPath))} ${pc.dim(`(${countLabel})`)}`);

      const sorted = [...fileFindings].sort((a, b) =>
        a.line !== b.line ? a.line - b.line : a.column - b.column,
      );

      for (const finding of sorted) {
        const location = `${finding.line}:${finding.column}`.padEnd(7);
        const badge = formatCategoryBadge(finding.category);
        const severity = formatSeverity(finding.severity);
        const autoTag = finding.fix ? pc.dim(' (auto-fixable)') : '';

        writeLine(
          process.stdout,
          `  ${pc.dim(location)} ${badge} ${severity}  ${pc.bold(finding.ruleId)}`,
        );
        writeLine(
          process.stdout,
          `          ${pc.dim(truncateText(finding.snippet.trim(), 92))}`,
        );
        writeLine(process.stdout, `          ${pc.dim('Why:')} ${finding.reason}`);
        writeLine(
          process.stdout,
          `          ${pc.green('Fix:')} ${finding.suggestion}${autoTag}`,
        );
      }

      writeLine(process.stdout);
    }
  }

  writeLine(process.stdout, pc.dim('─'.repeat(64)));

  const scoreLabel = pc.bold(colorizeByScore(summary.score, `${String(summary.score).padStart(3, ' ')} / 100`));
  const bar = renderScoreBar(summary.score);
  const gradeLabel = formatGrade(summary.score, summary.grade);

  writeLine(process.stdout, `Craft Score  ${scoreLabel}  ${bar}  ${gradeLabel}`);
  writeLine(
    process.stdout,
    pc.dim(
      `Files: ${summary.filesScanned} scanned (${summary.filesWithFindings} flagged)  ·  ${summary.counts.COPY} COPY · ${summary.counts.UI} UI · ${summary.counts.CODE} CODE`,
    ),
  );

  if (summary.fixedCount > 0) {
    writeLine(
      process.stdout,
      pc.green(
        `Applied ${summary.fixedCount} safe auto-fix${summary.fixedCount === 1 ? '' : 'es'}.`,
      ),
    );
  }

  if (summary.autoFixableRemaining > 0) {
    writeLine(
      process.stdout,
      pc.dim(
        `Hint: Run with --fix to clean ${summary.autoFixableRemaining} safe auto-fixable issue${summary.autoFixableRemaining === 1 ? '' : 's'}.`,
      ),
    );
  }

  writeLine(process.stdout);
}

export function printInitReport(results: readonly InitFileResult[], cwd: string): void {
  if (results.length === 0) {
    writeLine(process.stdout, pc.dim('No rule files were modified.'));
    return;
  }

  for (const item of results) {
    const displayPath = toDisplayPath(cwd, item.filePath);
    let badge: string;
    switch (item.status) {
      case 'created':
        badge = pc.green('created');
        break;
      case 'merged':
        badge = pc.cyan('merged ');
        break;
      case 'updated':
        badge = pc.yellow('updated');
        break;
    }
    writeLine(process.stdout, `  ${badge}  ${displayPath}`);
  }

  writeLine(process.stdout);
  writeLine(
    process.stdout,
    pc.dim('Craft rules installed between <!-- de-slop:start --> and <!-- de-slop:end --> markers.'),
  );
  writeLine(
    process.stdout,
    pc.dim('Existing project instructions outside those markers were preserved.'),
  );
  writeLine(process.stdout);
}

export function printError(message: string): void {
  writeLine(process.stderr, `${pc.red('error')}  ${message}`);
}

export function printInfo(message: string): void {
  writeLine(process.stdout, `${pc.cyan('info')}   ${message}`);
}
