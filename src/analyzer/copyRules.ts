// de-slop-ignore-file
import type { AnalyzerRule, AutoFix, Finding, RuleContext } from '../types.js';

interface TextSegment {
  lineIndex: number;
  startColumn: number;
  text: string;
}

const TECHNICAL_ATTR_PATTERN =
  /\b(?:className|class|id|key|type|name|href|src|d|viewBox|data-testid|aria-controls|htmlFor|role|rel|target|method|action)\s*=\s*$/;

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const JSX_EXTENSIONS = new Set(['.tsx', '.jsx']);

function blankRange(chars: string[], start: number, end: number): void {
  for (let i = start; i < end && i < chars.length; i++) {
    chars[i] = ' ';
  }
}

function matchCase(source: string, replacement: string): string {
  if (source.length === 0 || replacement.length === 0) {
    return replacement;
  }
  if (source === source.toUpperCase() && /[A-Z]/.test(source)) {
    return replacement.toUpperCase();
  }
  const first = source[0];
  if (first !== undefined && first >= 'A' && first <= 'Z') {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function extractMarkdownSegments(lines: readonly string[]): TextSegment[] {
  const segments: TextSegment[] = [];
  let inFencedBlock = false;
  let inHtmlComment = false;
  let inManagedBlock = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? '';
    const trimmed = line.trim();

    if (trimmed === '<!-- de-slop:start -->') {
      inManagedBlock = true;
      continue;
    }
    if (trimmed === '<!-- de-slop:end -->') {
      inManagedBlock = false;
      continue;
    }
    if (inManagedBlock) {
      continue;
    }

    if (/^(?:```|~~~)/.test(trimmed)) {
      inFencedBlock = !inFencedBlock;
      continue;
    }
    if (inFencedBlock) {
      continue;
    }

    if (inHtmlComment) {
      if (trimmed.includes('-->')) {
        inHtmlComment = false;
      }
      continue;
    }

    if (trimmed.startsWith('<!--') && !trimmed.includes('-->')) {
      inHtmlComment = true;
      continue;
    }

    const chars = line.split('');
    for (const match of line.matchAll(/`[^`]*`/g)) {
      if (match.index !== undefined) {
        blankRange(chars, match.index, match.index + match[0].length);
      }
    }
    for (const match of line.matchAll(/<!--.*?-->/g)) {
      if (match.index !== undefined) {
        blankRange(chars, match.index, match.index + match[0].length);
      }
    }

    const sanitized = chars.join('');
    if (sanitized.trim().length > 0) {
      segments.push({ lineIndex, startColumn: 0, text: sanitized });
    }
  }

  return segments;
}

function extractHtmlSegments(lines: readonly string[]): TextSegment[] {
  const segments: TextSegment[] = [];
  let inIgnoredTag = false;
  let inComment = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? '';
    const lower = line.toLowerCase();

    if (inComment) {
      if (lower.includes('-->')) {
        inComment = false;
      }
      continue;
    }
    if (inIgnoredTag) {
      if (/<\/(?:script|style)\s*>/i.test(line)) {
        inIgnoredTag = false;
      }
      continue;
    }

    if (/<(?:script|style)\b/i.test(line) && !/<\/(?:script|style)\s*>/i.test(line)) {
      inIgnoredTag = true;
      continue;
    }
    if (line.includes('<!--') && !line.includes('-->')) {
      inComment = true;
      continue;
    }

    const attrRegex = /\b(?:placeholder|title|alt|aria-label)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    for (const match of line.matchAll(attrRegex)) {
      const value = match[1] ?? match[2];
      if (value && match.index !== undefined) {
        const quoteOffset = match[0].indexOf(value);
        if (quoteOffset >= 0) {
          segments.push({
            lineIndex,
            startColumn: match.index + quoteOffset,
            text: value,
          });
        }
      }
    }

    const chars = line.split('');
    for (const commentMatch of line.matchAll(/<!--.*?-->/g)) {
      if (commentMatch.index !== undefined) {
        blankRange(chars, commentMatch.index, commentMatch.index + commentMatch[0].length);
      }
    }
    for (const tagMatch of line.matchAll(/<[^>]*>/g)) {
      if (tagMatch.index !== undefined) {
        blankRange(chars, tagMatch.index, tagMatch.index + tagMatch[0].length);
      }
    }

    const visible = chars.join('');
    if (visible.trim().length > 0) {
      segments.push({ lineIndex, startColumn: 0, text: visible });
    }
  }

  return segments;
}

function isLikelyJsxProseLine(trimmed: string): boolean {
  if (trimmed.length === 0) {
    return false;
  }
  if (/^(?:import|export|const|let|var|function|class|interface|type|enum|return|if|else|for|while|switch|case|default|try|catch|finally|throw|await|\/\/|\/\*|\*|<|>|\{|\}|\(|\)|\[|\]|\.)/.test(trimmed)) {
    return false;
  }
  if (/(?:=>|===|!==|\?:|;\s*$|=\s*[{([]|^\w+\s*:\s*\w+)/.test(trimmed)) {
    return false;
  }
  return /[A-Za-z]{2,}/.test(trimmed);
}

function extractCodeCopySegments(lines: readonly string[], isJsx: boolean): TextSegment[] {
  const segments: TextSegment[] = [];
  let inBlockComment = false;
  let insideJsxChildren = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? '';
    const trimmed = line.trim();

    if (inBlockComment) {
      if (trimmed.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) {
        inBlockComment = true;
      }
      continue;
    }

    if (trimmed.startsWith('//') || /^(?:import|export\s+\*|\s*export\s+\{[^}]*\}\s+from)\b/.test(trimmed)) {
      continue;
    }

    // Extract quoted string literals while skipping comments and technical attributes.
    let i = 0;
    let inString: '"' | "'" | '`' | null = null;
    let stringStart = -1;
    let escaped = false;

    while (i < line.length) {
      const ch = line[i] ?? '';
      const next = line[i + 1] ?? '';

      if (inString === null) {
        if (ch === '/' && next === '/') {
          break;
        }
        if (ch === '/' && next === '*') {
          const closeIdx = line.indexOf('*/', i + 2);
          if (closeIdx === -1) {
            inBlockComment = true;
            break;
          }
          i = closeIdx + 2;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          inString = ch;
          stringStart = i + 1;
          escaped = false;
        }
        i += 1;
        continue;
      }

      if (escaped) {
        escaped = false;
        i += 1;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        i += 1;
        continue;
      }

      if (ch === inString) {
        const prefixBeforeQuote = line.slice(0, stringStart - 1);
        const value = line.slice(stringStart, i);
        if (value.trim().length > 0 && !TECHNICAL_ATTR_PATTERN.test(prefixBeforeQuote)) {
          segments.push({
            lineIndex,
            startColumn: stringStart,
            text: value,
          });
        }
        inString = null;
        stringStart = -1;
      }

      i += 1;
    }

    if (!isJsx) {
      continue;
    }

    // Extract inline JSX text nodes between '>' and '<' on the same line.
    const inlineJsxRegex = /(?<![=-])>([^<>{}\n]+)<\/?[A-Za-z]/g;
    for (const match of line.matchAll(inlineJsxRegex)) {
      const inner = match[1];
      if (inner && inner.trim().length > 0 && match.index !== undefined) {
        segments.push({
          lineIndex,
          startColumn: match.index + 1,
          text: inner,
        });
      }
    }

    // Track multi-line JSX child regions cleanly.
    if (insideJsxChildren) {
      if (trimmed.startsWith('</') || trimmed.startsWith('}')) {
        insideJsxChildren = false;
      } else if (isLikelyJsxProseLine(trimmed)) {
        const sanitized = line.replace(/\{[^{}]*\}/g, (expr) => ' '.repeat(expr.length));
        if (sanitized.trim().length > 0) {
          segments.push({
            lineIndex,
            startColumn: 0,
            text: sanitized,
          });
        }
      }
    }

    const opensTagBody =
      /(?:<[A-Za-z][^>\n]*|^\s*)>$/.test(trimmed) &&
      !trimmed.endsWith('=>') &&
      !trimmed.endsWith('/>') &&
      !trimmed.startsWith('</');

    if (opensTagBody) {
      insideJsxChildren = true;
    }
  }

  return segments;
}

function extractCopySegments(ctx: RuleContext): TextSegment[] {
  if (ctx.extension === '.md') {
    return extractMarkdownSegments(ctx.lines);
  }
  if (ctx.extension === '.html') {
    return extractHtmlSegments(ctx.lines);
  }
  if (CODE_EXTENSIONS.has(ctx.extension)) {
    return extractCodeCopySegments(ctx.lines, JSX_EXTENSIONS.has(ctx.extension));
  }
  return [];
}

interface BuzzwordPattern {
  regex: RegExp;
  reason: string;
  suggestion: string;
  autoReplace?: (match: string) => string;
  autoDescription?: string;
}

const BUZZWORD_PATTERNS: readonly BuzzwordPattern[] = [
  {
    regex: /\bunleash the (?:full )?power of\b/gi,
    reason: 'Classic LLM marketing hype phrase that adds zero concrete information.',
    suggestion: 'Start directly with the verb or action: "Automate...", "Build...", or "Use...".',
    autoReplace: (match) => matchCase(match, 'use'),
    autoDescription: 'Replace hype opener with direct verb',
  },
  {
    regex: /\bunlock the (?:full )?potential of\b/gi,
    reason: 'Generic AI cliché used when copy lacks specific product capabilities.',
    suggestion: 'Name the concrete outcome users get (e.g. "Ship faster with...").',
    autoReplace: (match) => matchCase(match, 'get more from'),
    autoDescription: 'Replace generic potential cliché',
  },
  {
    regex: /\bdelve into\b/gi,
    reason: '"Delve into" is one of the strongest statistical fingerprints of unedited AI prose.',
    suggestion: 'Use direct verbs like "inspect", "read", or "debug".',
    autoReplace: (match) => matchCase(match, 'inspect'),
    autoDescription: 'Replace "delve into" with "inspect"',
  },
  {
    regex: /\belevate your\b/gi,
    reason: '"Elevate your..." is empty SaaS fluff.',
    suggestion: 'Specify what actually improves: "Speed up your...", "Simplify your...", or "Improve your...".',
    autoReplace: (match) => matchCase(match, 'improve your'),
    autoDescription: 'Replace "elevate your" with "improve your"',
  },
  {
    regex: /\bsupercharge your\b/gi,
    reason: '"Supercharge" reads like auto-generated landing-page filler.',
    suggestion: 'Quantify the improvement or use a crisp verb like "speed up your".',
    autoReplace: (match) => matchCase(match, 'speed up your'),
    autoDescription: 'Replace "supercharge your" with "speed up your"',
  },
  {
    regex: /\brevolutionize your\b/gi,
    reason: 'Hyperbolic AI claim that erodes engineering credibility.',
    suggestion: 'State what changed plainly: "simplify your", "automate your", or "replace manual...".',
    autoReplace: (match) => matchCase(match, 'simplify your'),
    autoDescription: 'Replace "revolutionize your" with "simplify your"',
  },
  {
    regex: /\bstreamline your\b/gi,
    reason: 'Vague AI filler word instead of stating what friction disappears.',
    suggestion: 'Replace with the specific step eliminated or use "simplify your".',
    autoReplace: (match) => matchCase(match, 'simplify your'),
    autoDescription: 'Replace "streamline your" with "simplify your"',
  },
  {
    regex: /\bgame-changing\b/gi,
    reason: 'Empty superlative that never appears in restrained Stripe/Linear-grade copy.',
    suggestion: 'Remove the adjective or state the measurable difference.',
    autoReplace: (match) => matchCase(match, 'practical'),
    autoDescription: 'Replace "game-changing" with "practical"',
  },
  {
    regex: /\bcutting-edge\b/gi,
    reason: 'Stale buzzword that sounds robotic and dated.',
    suggestion: 'Name the actual technology or write "modern".',
    autoReplace: (match) => matchCase(match, 'modern'),
    autoDescription: 'Replace "cutting-edge" with "modern"',
  },
  {
    regex: /\bnext-gen(?:eration)?\b/gi,
    reason: 'Generic buzzword used in place of actual technical differentiation.',
    suggestion: 'Describe the architecture or write "modern".',
    autoReplace: (match) => matchCase(match, 'modern'),
    autoDescription: 'Replace "next-gen" with "modern"',
  },
  {
    regex: /\bseamlessly\s+/g,
    reason: '"Seamlessly" is an AI filler adverb that adds no concrete meaning.',
    suggestion: 'Delete "seamlessly" and state how the integration works.',
    autoReplace: () => '',
    autoDescription: 'Remove filler adverb "seamlessly"',
  },
  {
    regex: /\bin today's (?:fast-paced|ever-evolving|modern|digital) (?:world|landscape|era)\b/gi,
    reason: 'Notorious AI essay opener that wastes the reader\'s first sentence.',
    suggestion: 'Delete the throat-clearing opener and start with the concrete problem.',
  },
  {
    regex: /\bembark on a journey\b/gi,
    reason: 'Flowery AI metaphor unsuitable for technical or product interfaces.',
    suggestion: 'State the first concrete action the user takes.',
  },
  {
    regex: /\bharness the power\b/gi,
    reason: 'Inflated AI marketing phrasing.',
    suggestion: 'State what tool or API capability is used directly.',
  },
  {
    regex: /\b(?:delve|tapestry|unleash(?:es|ed|ing)?|elevat(?:e|es|ed|ing)|game[- ]changer|revolutioniz(?:e|es|ed|ing)|seamless(?:ly)?|empower(?:s|ed|ing)?|synerg(?:y|ies|istic)|robust|streamlin(?:e|es|ed|ing)|transformative|supercharg(?:e|es|ed|ing))\b/gi,
    reason: 'Overused LLM buzzword that makes product copy sound synthetic.',
    suggestion: 'Replace with plain, verifiable language describing what the software actually does.',
  },
];

interface RegexCopyRuleSpec {
  regex: RegExp;
  reason: string;
  suggestion: string;
}

const HYPE_CTA_PATTERNS: readonly RegexCopyRuleSpec[] = [
  {
    regex: /\bget started today\b/gi,
    reason: 'Generic SaaS CTA formula.',
    suggestion: 'Use a specific action CTA (e.g., "Create free account" or "Install CLI").',
  },
  {
    regex: /\bstart your journey\b/gi,
    reason: 'Vague AI onboarding copy.',
    suggestion: 'Name the concrete first step (e.g., "Import your repository").',
  },
  {
    regex: /\bready to transform\b/gi,
    reason: 'Cliché AI hero subheading formula.',
    suggestion: 'State a measurable claim or direct product action instead.',
  },
  {
    regex: /\bexperience the future\b/gi,
    reason: 'Abstract hype claim with no product signal.',
    suggestion: 'Explain what changes in the user\'s workflow today.',
  },
  {
    regex: /\btake your [^.!?\n]{2,32} to the next level\b/gi,
    reason: 'Empty AI idiom that fails to explain how the product helps.',
    suggestion: 'State the concrete metric or bottleneck resolved.',
  },
  {
    regex: /\ball-in-one (?:platform|solution|workspace)\b/gi,
    reason: 'Generic positioning cliché that blurs what the product actually does best.',
    suggestion: 'Name the 2–3 core primitives the tool unifies.',
  },
  {
    regex: /\bsay goodbye to [^.!?\n]{2,40} and hello to\b/gi,
    reason: 'Overused AI contrast template.',
    suggestion: 'State the outcome directly in one short sentence.',
  },
];

const COPY_SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.html', '.md'] as const;

export const copyRules: readonly AnalyzerRule[] = [
  {
    id: 'copy/ai-buzzword',
    category: 'COPY',
    severity: 'medium',
    extensions: COPY_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];
      const segments = extractCopySegments(ctx);
      const occupiedByLine = new Map<number, Array<[number, number]>>();

      for (const segment of segments) {
        const lineText = ctx.lines[segment.lineIndex] ?? '';
        const occupied = occupiedByLine.get(segment.lineIndex) ?? [];

        for (const spec of BUZZWORD_PATTERNS) {
          spec.regex.lastIndex = 0;
          for (const match of segment.text.matchAll(spec.regex)) {
            if (match.index === undefined) {
              continue;
            }
            const startColumn = segment.startColumn + match.index;
            const endColumn = startColumn + match[0].length;
            const overlaps = occupied.some(
              ([occStart, occEnd]) => startColumn < occEnd && endColumn > occStart,
            );
            if (overlaps) {
              continue;
            }
            occupied.push([startColumn, endColumn]);

            let fix: AutoFix | undefined;
            if (spec.autoReplace && spec.autoDescription) {
              const replacement = spec.autoReplace(match[0]);
              if (lineText.slice(startColumn, endColumn) === match[0]) {
                fix = {
                  kind: 'replace-match',
                  startColumn,
                  endColumn,
                  replacement,
                  description: spec.autoDescription,
                };
              }
            }

            findings.push({
              ruleId: 'copy/ai-buzzword',
              category: 'COPY',
              severity: 'medium',
              filePath: ctx.filePath,
              line: segment.lineIndex + 1,
              column: startColumn + 1,
              snippet: lineText,
              match: match[0].trim(),
              reason: spec.reason,
              suggestion: spec.suggestion,
              fix,
            });
          }
        }

        occupiedByLine.set(segment.lineIndex, occupied);
      }

      return findings;
    },
  },
  {
    id: 'copy/hype-cta',
    category: 'COPY',
    severity: 'medium',
    extensions: COPY_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];
      const segments = extractCopySegments(ctx);

      for (const segment of segments) {
        const lineText = ctx.lines[segment.lineIndex] ?? '';
        for (const spec of HYPE_CTA_PATTERNS) {
          spec.regex.lastIndex = 0;
          for (const match of segment.text.matchAll(spec.regex)) {
            if (match.index === undefined) {
              continue;
            }
            const startColumn = segment.startColumn + match.index;
            findings.push({
              ruleId: 'copy/hype-cta',
              category: 'COPY',
              severity: 'medium',
              filePath: ctx.filePath,
              line: segment.lineIndex + 1,
              column: startColumn + 1,
              snippet: lineText,
              match: match[0],
              reason: spec.reason,
              suggestion: spec.suggestion,
            });
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'copy/generic-placeholder',
    category: 'COPY',
    severity: 'high',
    extensions: COPY_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];
      const segments = extractCopySegments(ctx);

      const loremRegex = /\blorem ipsum(?:\s+dolor(?:\s+sit\s+amet)?)?(?:[^"'`<\n]{0,120})?/gi;
      const genericErrorRegex = /\bsomething went wrong\.?\s*please try again\.?/gi;
      const genericTaglineRegex = /\byour (?:awesome|amazing|next big) (?:app|product|project|idea|tagline)\b/gi;

      for (const segment of segments) {
        const lineText = ctx.lines[segment.lineIndex] ?? '';

        loremRegex.lastIndex = 0;
        for (const match of segment.text.matchAll(loremRegex)) {
          if (match.index === undefined) {
            continue;
          }
          const startColumn = segment.startColumn + match.index;
          const endColumn = startColumn + match[0].length;
          const canReplace = lineText.slice(startColumn, endColumn) === match[0];

          findings.push({
            ruleId: 'copy/generic-placeholder',
            category: 'COPY',
            severity: 'high',
            filePath: ctx.filePath,
            line: segment.lineIndex + 1,
            column: startColumn + 1,
            snippet: lineText,
            match: match[0],
            reason: 'Unreplaced Latin placeholder text shipped in user-facing copy.',
            suggestion: 'Write realistic domain-specific copy matching the target component density.',
            fix: canReplace
              ? {
                  kind: 'replace-match',
                  startColumn,
                  endColumn,
                  replacement: '[Replace with specific product copy]',
                  description: 'Replace Lorem ipsum placeholder',
                }
              : undefined,
          });
        }

        genericErrorRegex.lastIndex = 0;
        for (const match of segment.text.matchAll(genericErrorRegex)) {
          if (match.index === undefined) {
            continue;
          }
          findings.push({
            ruleId: 'copy/generic-placeholder',
            category: 'COPY',
            severity: 'high',
            filePath: ctx.filePath,
            line: segment.lineIndex + 1,
            column: segment.startColumn + match.index + 1,
            snippet: lineText,
            match: match[0],
            reason: 'Generic error copy gives users zero diagnostic context or recovery path.',
            suggestion: 'State what failed and the exact next action (e.g. "Could not save billing address. Verify postal code.").',
          });
        }

        genericTaglineRegex.lastIndex = 0;
        for (const match of segment.text.matchAll(genericTaglineRegex)) {
          if (match.index === undefined) {
            continue;
          }
          findings.push({
            ruleId: 'copy/generic-placeholder',
            category: 'COPY',
            severity: 'high',
            filePath: ctx.filePath,
            line: segment.lineIndex + 1,
            column: segment.startColumn + match.index + 1,
            snippet: lineText,
            match: match[0],
            reason: 'Template placeholder phrasing left unedited.',
            suggestion: 'Replace with the actual product name or concise value proposition.',
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'copy/excessive-exclamation',
    category: 'COPY',
    severity: 'low',
    extensions: COPY_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];
      const segments = extractCopySegments(ctx);

      for (const segment of segments) {
        const lineText = ctx.lines[segment.lineIndex] ?? '';
        for (const match of segment.text.matchAll(/!{2,}(?!=)/g)) {
          if (match.index === undefined) {
            continue;
          }
          findings.push({
            ruleId: 'copy/excessive-exclamation',
            category: 'COPY',
            severity: 'low',
            filePath: ctx.filePath,
            line: segment.lineIndex + 1,
            column: segment.startColumn + match.index + 1,
            snippet: lineText,
            match: match[0],
            reason: 'Repeated exclamation marks convey synthetic urgency.',
            suggestion: 'Use calm, factual punctuation (at most a single period or exclamation mark).',
          });
        }
      }

      return findings;
    },
  },
];
