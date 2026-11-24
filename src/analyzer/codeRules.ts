// de-slop-ignore-file
import type { AnalyzerRule, Finding } from '../types.js';

const CODE_SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'] as const;
const TS_EXTENSIONS = new Set(['.ts', '.tsx']);

function stripStringsAndComments(line: string, state: { inBlockComment: boolean }): string {
  let out = '';
  let i = 0;
  let inString: '"' | "'" | '`' | null = null;
  let escaped = false;

  while (i < line.length) {
    const ch = line[i] ?? '';
    const next = line[i + 1] ?? '';

    if (state.inBlockComment) {
      if (ch === '*' && next === '/') {
        state.inBlockComment = false;
        out += '  ';
        i += 2;
        continue;
      }
      out += ' ';
      i += 1;
      continue;
    }

    if (inString !== null) {
      out += ' ';
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === inString) {
        inString = null;
      }
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      out += ' '.repeat(line.length - i);
      break;
    }

    if (ch === '/' && next === '*') {
      state.inBlockComment = true;
      out += '  ';
      i += 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      out += ' ';
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function getStrippedLines(lines: readonly string[]): string[] {
  const state = { inBlockComment: false };
  return lines.map((line) => stripStringsAndComments(line, state));
}

const RATIONALE_CUE_REGEX =
  /\b(?:because|since|why|workaround|caveat|invariant|must|avoid|prevent|bug|issue|safari|chrome|firefox|windows|spec|rfc|de-slop-ignore|eslint|@ts-|prettier|todo|fixme|note|hack|xxx)\b/i;

const NARRATING_PATTERNS: readonly RegExp[] = [
  /^(?:set|update|initialize|init|reset|define|declare|create|get|read|store)\s+(?:the\s+)?(?:state|local state|component state|initial state|variables?|refs?|props?|context|constants?|types?|styles?|config)\b/i,
  /^(?:handle|on)\s+(?:the\s+)?(?:click|change|submit|input|focus|blur|hover|key\s*down|press|close|open|toggle|select|delete|update|save|cancel|reset|error|button click|form submit)\b/i,
  /^(?:event\s+handlers?|click\s+handlers?|state\s+(?:variables|hooks|management)|hooks?|imports?|exports?|helper\s+functions?|utility\s+functions?|main\s+component|props\s+interface|type\s+definitions?|component\s+definition)\b/i,
  /^(?:return|render)\s+(?:the\s+)?(?:jsx|ui|component|markup|output|element|view|result)\b/i,
  /^(?:fetch|load)\s+(?:the\s+)?(?:data|items|users|posts|list)\s*(?:from\s+api)?$/i,
  /^(?:export\s+(?:the\s+)?(?:component|default|function|module)|import\s+(?:dependencies|packages|modules|components|styles|hooks))\b/i,
];

const PLACEHOLDER_STUB_REGEX =
  /\/\/\s*(?:TODO:\s*(?:implement|add|finish|complete|handle)|\.{3}\s*(?:rest of|existing code|more)|add your (?:code|logic) here|your code here|implement (?:this|here|logic))/i;

const EXPLICIT_ANY_REGEX =
  /(?::\s*any(?=\s*(?:[,)=;{}|&[\]>]|$))|\bas\s+any\b|<any>|Array<any>|Promise<any>|Record<[^,>\n]+,\s*any>)/;

export const codeRules: readonly AnalyzerRule[] = [
  {
    id: 'code/narrating-comment',
    category: 'CODE',
    severity: 'medium',
    extensions: CODE_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];

      for (let lineIndex = 0; lineIndex < ctx.lines.length; lineIndex++) {
        const line = ctx.lines[lineIndex] ?? '';
        const commentMatch = /^\s*\/\/\s*(.+)$/.exec(line);
        if (!commentMatch) {
          continue;
        }
        const commentBody = (commentMatch[1] ?? '').trim();
        if (commentBody.length === 0 || commentBody.length > 65) {
          continue;
        }
        if (RATIONALE_CUE_REGEX.test(commentBody)) {
          continue;
        }

        const isNarrating = NARRATING_PATTERNS.some((pattern) => pattern.test(commentBody));
        if (!isNarrating) {
          continue;
        }

        const slashCol = line.indexOf('//');
        findings.push({
          ruleId: 'code/narrating-comment',
          category: 'CODE',
          severity: 'medium',
          filePath: ctx.filePath,
          line: lineIndex + 1,
          column: slashCol + 1,
          snippet: line,
          match: `// ${commentBody}`,
          reason: 'Comment narrates obvious code structure instead of explaining a non-obvious "why".',
          suggestion: 'Delete the narrating comment; rely on clear function and variable names.',
          fix: {
            kind: 'delete-line',
            description: 'Remove redundant narrating comment',
          },
        });
      }

      return findings;
    },
  },
  {
    id: 'code/empty-catch',
    category: 'CODE',
    severity: 'high',
    extensions: CODE_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];
      const strippedLines = getStrippedLines(ctx.lines);

      for (let lineIndex = 0; lineIndex < strippedLines.length; lineIndex++) {
        const line = strippedLines[lineIndex] ?? '';
        const originalLine = ctx.lines[lineIndex] ?? '';

        const singleLineEmpty = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/.exec(line);
        if (singleLineEmpty) {
          findings.push({
            ruleId: 'code/empty-catch',
            category: 'CODE',
            severity: 'high',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: singleLineEmpty.index + 1,
            snippet: originalLine,
            match: singleLineEmpty[0],
            reason: 'Empty catch block silently swallows runtime exceptions.',
            suggestion: 'Handle the failure explicitly, surface an error state, or rethrow with context.',
          });
          continue;
        }

        const multiLineOpen = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*$/.exec(line);
        if (!multiLineOpen) {
          continue;
        }

        let isEmptyBlock = true;
        let closed = false;
        for (let lookahead = lineIndex + 1; lookahead < strippedLines.length; lookahead++) {
          const inner = strippedLines[lookahead] ?? '';
          const closeIndex = inner.indexOf('}');
          if (closeIndex !== -1) {
            const beforeClose = inner.slice(0, closeIndex).trim();
            if (beforeClose.length > 0) {
              isEmptyBlock = false;
            }
            closed = true;
            break;
          }
          if (inner.trim().length > 0) {
            isEmptyBlock = false;
            break;
          }
        }

        if (closed && isEmptyBlock) {
          findings.push({
            ruleId: 'code/empty-catch',
            category: 'CODE',
            severity: 'high',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: multiLineOpen.index + 1,
            snippet: originalLine,
            match: multiLineOpen[0],
            reason: 'Catch block contains no error handling or recovery logic.',
            suggestion: 'Log, recover, or rethrow the error instead of swallowing it.',
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'code/nested-ternary',
    category: 'CODE',
    severity: 'high',
    extensions: CODE_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];
      const strippedLines = getStrippedLines(ctx.lines);

      for (let lineIndex = 0; lineIndex < strippedLines.length; lineIndex++) {
        const line = strippedLines[lineIndex] ?? '';
        const originalLine = ctx.lines[lineIndex] ?? '';
        if (!line.includes('?')) {
          continue;
        }

        // Strip optional chaining (?.), nullish coalescing (??), and TS optional markers (?:).
        const normalized = line
          .replace(/\?\./g, '  ')
          .replace(/\?\?/g, '  ')
          .replace(/\?:/g, '  ');

        const questionMarks = [...normalized.matchAll(/\?/g)];
        if (questionMarks.length >= 2) {
          const second = questionMarks[1];
          findings.push({
            ruleId: 'code/nested-ternary',
            category: 'CODE',
            severity: 'high',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: (second?.index ?? 0) + 1,
            snippet: originalLine,
            match: originalLine.trim(),
            reason: 'Nested ternary expressions obscure control flow and invite subtle edge-case bugs.',
            suggestion: 'Extract a lookup map, helper function, or early-return if/else branches.',
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'code/explicit-any',
    category: 'CODE',
    severity: 'high',
    extensions: CODE_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      if (!TS_EXTENSIONS.has(ctx.extension)) {
        return [];
      }

      const findings: Finding[] = [];
      const strippedLines = getStrippedLines(ctx.lines);

      for (let lineIndex = 0; lineIndex < strippedLines.length; lineIndex++) {
        const line = strippedLines[lineIndex] ?? '';
        const originalLine = ctx.lines[lineIndex] ?? '';
        const match = EXPLICIT_ANY_REGEX.exec(line);
        if (match) {
          findings.push({
            ruleId: 'code/explicit-any',
            category: 'CODE',
            severity: 'high',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: match.index + 1,
            snippet: originalLine,
            match: match[0],
            reason: 'Explicit "any" disables TypeScript static guarantees and masks contract mismatches.',
            suggestion: 'Use a concrete interface, generic type parameter, or "unknown" with runtime narrowing.',
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'code/console-leftover',
    category: 'CODE',
    severity: 'low',
    extensions: CODE_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];
      const strippedLines = getStrippedLines(ctx.lines);

      for (let lineIndex = 0; lineIndex < strippedLines.length; lineIndex++) {
        const line = strippedLines[lineIndex] ?? '';
        const originalLine = ctx.lines[lineIndex] ?? '';
        const match = /\bconsole\.log\s*\(/.exec(line);
        if (match) {
          findings.push({
            ruleId: 'code/console-leftover',
            category: 'CODE',
            severity: 'low',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: match.index + 1,
            snippet: originalLine,
            match: match[0],
            reason: 'Debug console.log statement left in production source.',
            suggestion: 'Remove debug logging or route through a structured application logger.',
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'code/redundant-boolean-return',
    category: 'CODE',
    severity: 'low',
    extensions: CODE_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];
      const strippedLines = getStrippedLines(ctx.lines);

      for (let lineIndex = 0; lineIndex < strippedLines.length; lineIndex++) {
        const line = strippedLines[lineIndex] ?? '';
        const originalLine = ctx.lines[lineIndex] ?? '';
        const match =
          /\breturn\b[^;\n]*\?\s*(?:true\s*:\s*false|false\s*:\s*true)\b/.exec(line);
        if (match) {
          findings.push({
            ruleId: 'code/redundant-boolean-return',
            category: 'CODE',
            severity: 'low',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: match.index + 1,
            snippet: originalLine,
            match: match[0],
            reason: 'Returning true/false via ternary adds noise around a boolean expression.',
            suggestion: 'Return the boolean expression directly (e.g. return Boolean(cond) or return !cond).',
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'code/placeholder-stub',
    category: 'CODE',
    severity: 'high',
    extensions: CODE_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];

      for (let lineIndex = 0; lineIndex < ctx.lines.length; lineIndex++) {
        const line = ctx.lines[lineIndex] ?? '';
        const match = PLACEHOLDER_STUB_REGEX.exec(line);
        if (match) {
          findings.push({
            ruleId: 'code/placeholder-stub',
            category: 'CODE',
            severity: 'high',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: match.index + 1,
            snippet: line,
            match: match[0],
            reason: 'Incomplete AI stub comment left unimplemented in source.',
            suggestion: 'Implement the complete behavior or remove the unfinished stub.',
          });
        }
      }

      return findings;
    },
  },
];
