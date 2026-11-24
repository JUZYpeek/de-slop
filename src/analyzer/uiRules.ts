// de-slop-ignore-file
import type { AnalyzerRule, Finding } from '../types.js';

const UI_SUPPORTED_EXTENSIONS = ['.tsx', '.jsx', '.html', '.css', '.ts', '.js'] as const;

const PURPLE_INDIGO_STOP_REGEX = /\b(?:from|via|to)-(?:purple|violet|indigo|fuchsia|pink)-\d{2,3}\b/g;
const GRADIENT_DIR_REGEX = /\bbg-(?:gradient|linear)-to-[a-z]{1,2}\b/;
const CSS_PURPLE_GRADIENT_REGEX =
  /linear-gradient\([^)]*(?:#8b5cf6|#7c3aed|#9333ea|#a855f7|#6366f1|#4f46e5|#ec4899|#d946ef|purple|violet|indigo|fuchsia)/i;

const NEON_COLOR_REGEX = /\b(?:bg|from|via|to)-(?:purple|violet|indigo|fuchsia|pink|cyan)-\d{2,3}\b/;
const HYPE_GRADIENT_TEXT_REGEX = /\b(?:from|via|to)-(?:purple|violet|indigo|fuchsia|pink|cyan)-\d{2,3}\b/;

const LAYOUT_ANIM_PROP_REGEX =
  /(?<![a-z-])(?:width|height|min-width|min-height|max-width|max-height|top|left|right|bottom|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?)\s*:/i;

const STOCK_PERSONA_REGEX =
  /\b(?:Sarah Jenkins|Sarah Chen|Alex Rivera|Emily Chen|Marcus Vance|John Doe|Jane Doe|Acme Corp|TechCorp)\b/g;

export const uiRules: readonly AnalyzerRule[] = [
  {
    id: 'ui/ai-purple-gradient',
    category: 'UI',
    severity: 'high',
    extensions: UI_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];

      for (let lineIndex = 0; lineIndex < ctx.lines.length; lineIndex++) {
        const line = ctx.lines[lineIndex] ?? '';

        if (GRADIENT_DIR_REGEX.test(line)) {
          const stops = line.match(PURPLE_INDIGO_STOP_REGEX) ?? [];
          if (stops.length >= 2) {
            const firstMatch = stops[0] ?? '';
            const col = Math.max(0, line.indexOf(firstMatch));
            findings.push({
              ruleId: 'ui/ai-purple-gradient',
              category: 'UI',
              severity: 'high',
              filePath: ctx.filePath,
              line: lineIndex + 1,
              column: col + 1,
              snippet: line,
              match: stops.join(' '),
              reason: 'Default LLM purple-indigo gradient makes the UI look instantly template-generated.',
              suggestion:
                'Use a crisp neutral surface (bg-white dark:bg-neutral-950) with a 1px hairline border (border-neutral-200/80 dark:border-white/10) and one restrained accent.',
            });
            continue;
          }
        }

        if (ctx.extension === '.css') {
          const cssMatch = CSS_PURPLE_GRADIENT_REGEX.exec(line);
          if (cssMatch) {
            findings.push({
              ruleId: 'ui/ai-purple-gradient',
              category: 'UI',
              severity: 'high',
              filePath: ctx.filePath,
              line: lineIndex + 1,
              column: cssMatch.index + 1,
              snippet: line,
              match: cssMatch[0],
              reason: 'Generic purple/indigo CSS linear-gradient reads like boilerplate AI styling.',
              suggestion:
                'Replace with solid neutral surface tokens and subtle 1px border contrast.',
            });
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'ui/bloated-card-chrome',
    category: 'UI',
    severity: 'medium',
    extensions: UI_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];

      for (let lineIndex = 0; lineIndex < ctx.lines.length; lineIndex++) {
        const line = ctx.lines[lineIndex] ?? '';
        const hasBloatedRadiusShadow =
          /\brounded-3xl\b/.test(line) && /\bshadow-(?:2xl|xl)\b/.test(line);
        const hasGlassShadowSlop =
          /\bshadow-2xl\b/.test(line) && /\bbackdrop-blur-(?:xl|2xl)\b/.test(line);

        if (hasBloatedRadiusShadow || hasGlassShadowSlop) {
          const anchor = line.match(/\b(?:rounded-3xl|shadow-2xl)\b/);
          const col = anchor?.index ?? 0;
          findings.push({
            ruleId: 'ui/bloated-card-chrome',
            category: 'UI',
            severity: 'medium',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: col + 1,
            snippet: line,
            match: anchor?.[0] ?? 'rounded-3xl shadow-2xl',
            reason: 'Oversized border radius paired with heavy drop-shadows creates muddy, amateur depth.',
            suggestion:
              'Use disciplined radius and borders: rounded-xl border border-neutral-200/80 shadow-sm (or dark:border-white/10).',
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'ui/gradient-text-slop',
    category: 'UI',
    severity: 'medium',
    extensions: UI_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];

      for (let lineIndex = 0; lineIndex < ctx.lines.length; lineIndex++) {
        const line = ctx.lines[lineIndex] ?? '';
        if (
          /\bbg-clip-text\b/.test(line) &&
          /\btext-transparent\b/.test(line) &&
          HYPE_GRADIENT_TEXT_REGEX.test(line)
        ) {
          const match = /\bbg-clip-text\b/.exec(line);
          findings.push({
            ruleId: 'ui/gradient-text-slop',
            category: 'UI',
            severity: 'medium',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: (match?.index ?? 0) + 1,
            snippet: line,
            match: 'bg-clip-text text-transparent',
            reason: 'Rainbow/neon gradient headings reduce contrast and scream AI landing-page boilerplate.',
            suggestion:
              'Use high-contrast solid ink (text-neutral-950 dark:text-neutral-50 tracking-tight) with hierarchy driven by size and weight.',
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'ui/neon-glow-slop',
    category: 'UI',
    severity: 'medium',
    extensions: UI_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];

      for (let lineIndex = 0; lineIndex < ctx.lines.length; lineIndex++) {
        const line = ctx.lines[lineIndex] ?? '';
        const blurMatch = /\bblur-3xl\b/.exec(line);
        const neonGlowShadow = /(?:drop-)?shadow-\[0_0_[^\]\n]+\]/.exec(line);

        if (blurMatch && NEON_COLOR_REGEX.test(line)) {
          findings.push({
            ruleId: 'ui/neon-glow-slop',
            category: 'UI',
            severity: 'medium',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: blurMatch.index + 1,
            snippet: line,
            match: blurMatch[0],
            reason: 'Decorative neon ambient blur blobs clutter visual hierarchy and waste GPU fill-rate.',
            suggestion:
              'Remove ambient blur blobs; establish focal hierarchy via spacing, crisp borders, and typography.',
          });
        } else if (neonGlowShadow) {
          findings.push({
            ruleId: 'ui/neon-glow-slop',
            category: 'UI',
            severity: 'medium',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: neonGlowShadow.index + 1,
            snippet: line,
            match: neonGlowShadow[0],
            reason: 'Arbitrary neon box-shadow glow breaks restrained surface contrast.',
            suggestion:
              'Replace neon glow with a crisp 1px border and subtle elevation (shadow-sm or ring-1 ring-inset).',
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'ui/transition-all-slop',
    category: 'UI',
    severity: 'medium',
    extensions: UI_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];

      for (let lineIndex = 0; lineIndex < ctx.lines.length; lineIndex++) {
        const line = ctx.lines[lineIndex] ?? '';
        const twMatch = /\btransition-all\b/.exec(line);
        if (twMatch) {
          findings.push({
            ruleId: 'ui/transition-all-slop',
            category: 'UI',
            severity: 'medium',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: twMatch.index + 1,
            snippet: line,
            match: twMatch[0],
            reason: 'transition-all animates layout and paint properties unexpectedly and harms INP.',
            suggestion:
              'Animate explicit properties only: transition-colors duration-150 ease-out or transition-transform duration-150 ease-out.',
          });
          continue;
        }

        if (ctx.extension === '.css') {
          const cssMatch = /\btransition\s*:\s*all\b/i.exec(line);
          if (cssMatch) {
            findings.push({
              ruleId: 'ui/transition-all-slop',
              category: 'UI',
              severity: 'medium',
              filePath: ctx.filePath,
              line: lineIndex + 1,
              column: cssMatch.index + 1,
              snippet: line,
              match: cssMatch[0],
              reason: 'CSS transition: all forces style recalculations on unrelated properties.',
              suggestion:
                'Specify GPU-composited properties: transition: transform 150ms ease-out, opacity 150ms ease-out;',
            });
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'ui/bouncy-or-layout-animation',
    category: 'UI',
    severity: 'medium',
    extensions: UI_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];
      let inKeyframes = false;
      let keyframeBraceDepth = 0;

      for (let lineIndex = 0; lineIndex < ctx.lines.length; lineIndex++) {
        const line = ctx.lines[lineIndex] ?? '';

        const bounceMatch = /\banimate-bounce\b/.exec(line);
        if (bounceMatch) {
          findings.push({
            ruleId: 'ui/bouncy-or-layout-animation',
            category: 'UI',
            severity: 'medium',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: bounceMatch.index + 1,
            snippet: line,
            match: bounceMatch[0],
            reason: 'Perpetual bouncing draws gratuitous distraction in product UIs.',
            suggestion:
              'Use purposeful tactile micro-interactions (active:scale-[0.98] transition-transform duration-150 ease-out).',
          });
        }

        const excessiveHover = /\bhover:(?:scale-(?:110|125|150)|-translate-y-[2-9])\b/.exec(line);
        if (excessiveHover) {
          findings.push({
            ruleId: 'ui/bouncy-or-layout-animation',
            category: 'UI',
            severity: 'medium',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: excessiveHover.index + 1,
            snippet: line,
            match: excessiveHover[0],
            reason: 'Exaggerated hover scaling/jumping feels playful rather than tactile and precise.',
            suggestion:
              'Keep hover shifts subtle: hover:border-neutral-300 or hover:-translate-y-0.5 duration-150 ease-out.',
          });
        }

        if (ctx.extension === '.css') {
          if (/@keyframes\b/i.test(line)) {
            inKeyframes = true;
            keyframeBraceDepth = 0;
          }
          if (inKeyframes) {
            for (const ch of line) {
              if (ch === '{') {
                keyframeBraceDepth += 1;
              } else if (ch === '}') {
                keyframeBraceDepth -= 1;
              }
            }
            const layoutMatch = LAYOUT_ANIM_PROP_REGEX.exec(line);
            if (layoutMatch) {
              findings.push({
                ruleId: 'ui/bouncy-or-layout-animation',
                category: 'UI',
                severity: 'high',
                filePath: ctx.filePath,
                line: lineIndex + 1,
                column: layoutMatch.index + 1,
                snippet: line,
                match: layoutMatch[0].trim(),
                reason: 'Animating layout properties inside @keyframes triggers browser reflow on every frame.',
                suggestion: 'Animate GPU-composited properties only: transform and opacity.',
              });
            }
            if (keyframeBraceDepth <= 0 && line.includes('}')) {
              inKeyframes = false;
            }
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'ui/missing-reduced-motion',
    category: 'UI',
    severity: 'low',
    extensions: ['.css'],
    analyze(ctx) {
      if (ctx.content.includes('prefers-reduced-motion')) {
        return [];
      }
      for (let lineIndex = 0; lineIndex < ctx.lines.length; lineIndex++) {
        const line = ctx.lines[lineIndex] ?? '';
        const animMatch = /@keyframes\b|\banimation(?:-name)?\s*:/.exec(line);
        if (animMatch) {
          return [
            {
              ruleId: 'ui/missing-reduced-motion',
              category: 'UI',
              severity: 'low',
              filePath: ctx.filePath,
              line: lineIndex + 1,
              column: animMatch.index + 1,
              snippet: line,
              match: animMatch[0],
              reason: 'Stylesheet defines motion without a @media (prefers-reduced-motion: reduce) fallback.',
              suggestion:
                'Add @media (prefers-reduced-motion: reduce) to disable or shorten non-essential animations.',
            },
          ];
        }
      }
      return [];
    },
  },
  {
    id: 'ui/placeholder-persona',
    category: 'UI',
    severity: 'medium',
    extensions: UI_SUPPORTED_EXTENSIONS,
    analyze(ctx) {
      const findings: Finding[] = [];
      for (let lineIndex = 0; lineIndex < ctx.lines.length; lineIndex++) {
        const line = ctx.lines[lineIndex] ?? '';
        STOCK_PERSONA_REGEX.lastIndex = 0;
        for (const match of line.matchAll(STOCK_PERSONA_REGEX)) {
          if (match.index === undefined) {
            continue;
          }
          findings.push({
            ruleId: 'ui/placeholder-persona',
            category: 'UI',
            severity: 'medium',
            filePath: ctx.filePath,
            line: lineIndex + 1,
            column: match.index + 1,
            snippet: line,
            match: match[0],
            reason: 'Overused LLM stock testimonial name/company immediately signals synthetic data.',
            suggestion: 'Use real customer quotes or clearly realistic domain fixtures.',
          });
        }
      }
      return findings;
    },
  },
];
