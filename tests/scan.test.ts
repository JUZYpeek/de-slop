// de-slop-ignore-file
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  analyzeContent,
  applySafeFixes,
  calculateCraftScore,
  scanTarget,
} from '../src/index.js';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));

describe('de-slop analyzer copy rules', () => {
  it('flags AI buzzwords and hype CTAs across TypeScript, JSX, and Markdown', () => {
    const tsx = [
      'export function Banner() {',
      '  return (',
      '    <div>',
      '      <h1>Unleash the power of seamless tools</h1>',
      '      <button>Get Started Today</button>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');

    const findings = analyzeContent('Banner.tsx', tsx);
    const ruleIds = findings.map((f) => f.ruleId);

    expect(ruleIds).toContain('copy/ai-buzzword');
    expect(ruleIds).toContain('copy/hype-cta');
  });

  it('ignores fenced code blocks, inline code, and managed rule blocks in Markdown', () => {
    const md = [
      '# Docs',
      '',
      'Use `delve` only as a search term.',
      '',
      '```ts',
      'const note = "Unleash the power of seamless tapestry";',
      '```',
      '',
      '<!-- de-slop:start -->',
      'Never use elevate or unleash in product UI.',
      '<!-- de-slop:end -->',
    ].join('\n');

    const findings = analyzeContent('README.md', md);
    expect(findings).toHaveLength(0);
  });

  it('detects generic placeholder text and repeated exclamations without flagging !==', () => {
    const sample = [
      'const valid = status !== "error";',
      'const err = "Something went wrong. Please try again.";',
      'const hero = "Ship faster today!!";',
    ].join('\n');

    const findings = analyzeContent('alerts.ts', sample);
    expect(findings.map((f) => f.ruleId)).toEqual([
      'copy/generic-placeholder',
      'copy/excessive-exclamation',
    ]);
  });
});

describe('de-slop analyzer UI rules', () => {
  it('detects default purple-indigo gradients, bloated cards, and transition-all', () => {
    const jsx = [
      '<section className="bg-gradient-to-r from-purple-500 to-indigo-600">',
      '  <div className="rounded-3xl shadow-2xl transition-all hover:scale-110">',
      '    <h2 className="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Hi</h2>',
      '    <div className="blur-3xl bg-purple-600/20" />',
      '  </div>',
      '</section>',
    ].join('\n');

    const findings = analyzeContent('Hero.tsx', jsx);
    const rules = new Set(findings.map((f) => f.ruleId));

    expect(rules.has('ui/ai-purple-gradient')).toBe(true);
    expect(rules.has('ui/bloated-card-chrome')).toBe(true);
    expect(rules.has('ui/transition-all-slop')).toBe(true);
    expect(rules.has('ui/bouncy-or-layout-animation')).toBe(true);
    expect(rules.has('ui/gradient-text-slop')).toBe(true);
    expect(rules.has('ui/neon-glow-slop')).toBe(true);
  });

  it('flags CSS layout keyframe animations and missing prefers-reduced-motion', () => {
    const css = [
      '@keyframes expandBox {',
      '  from { width: 100px; }',
      '  to { width: 240px; }',
      '}',
      '.panel { transition: all 200ms ease; animation: expandBox 300ms ease; }',
    ].join('\n');

    const findings = analyzeContent('panel.css', css);
    const rules = new Set(findings.map((f) => f.ruleId));

    expect(rules.has('ui/bouncy-or-layout-animation')).toBe(true);
    expect(rules.has('ui/transition-all-slop')).toBe(true);
    expect(rules.has('ui/missing-reduced-motion')).toBe(true);
  });
});

describe('de-slop analyzer code rules', () => {
  it('flags narrating comments while preserving rationale comments', () => {
    const code = [
      '// Set state',
      'const [open, setOpen] = useState(false);',
      '// Workaround because Safari drops focus inside dialogs on close.',
      'requestAnimationFrame(() => buttonRef.current?.focus());',
    ].join('\n');

    const findings = analyzeContent('Modal.tsx', code);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('code/narrating-comment');
    expect(findings[0]?.line).toBe(1);
    expect(findings[0]?.fix?.kind).toBe('delete-line');
  });

  it('flags empty catch blocks, nested ternaries, explicit any, console.log, and stubs', () => {
    const code = [
      'export function load(input: any) {',
      '  const tier = a ? b : c ? d : e;',
      '  console.log(tier);',
      '  try { work(); } catch (err) {}',
      '  // TODO: implement retry backoff',
      '  return tier ? true : false;',
      '}',
    ].join('\n');

    const findings = analyzeContent('loader.ts', code);
    const rules = new Set(findings.map((f) => f.ruleId));

    expect(rules.has('code/explicit-any')).toBe(true);
    expect(rules.has('code/nested-ternary')).toBe(true);
    expect(rules.has('code/console-leftover')).toBe(true);
    expect(rules.has('code/empty-catch')).toBe(true);
    expect(rules.has('code/placeholder-stub')).toBe(true);
    expect(rules.has('code/redundant-boolean-return')).toBe(true);
  });

  it('does not falsely flag TypeScript optional syntax, nullish coalescing, or JSX prose', () => {
    const code = [
      'interface Props { title?: string; }',
      'export function Card({ title }: Props) {',
      '  const label = title?.trim() ?? "Untitled";',
      '  return <p>Note: any unsaved edits stay local. {label}</p>;',
      '}',
    ].join('\n');

    const findings = analyzeContent('Card.tsx', code);
    expect(findings).toHaveLength(0);
  });
});

describe('inline suppressions and craft score', () => {
  it('respects de-slop-ignore and de-slop-ignore-next-line', () => {
    const code = [
      '// de-slop-ignore-next-line code/explicit-any',
      'export function parse(payload: any) {',
      '  console.log(payload); // de-slop-ignore',
      '}',
    ].join('\n');

    expect(analyzeContent('parse.ts', code)).toHaveLength(0);
  });

  it('computes 100 for clean files and penalizes findings deterministically', () => {
    expect(calculateCraftScore([], 5)).toEqual({ score: 100, grade: 'Principal Craft' });

    const sampleFindings = analyzeContent('bad.ts', 'const x: any = 1;\ntry {} catch {}');
    const result = calculateCraftScore(sampleFindings, 1);
    expect(result.score).toBeLessThan(90);
  });
});

describe('fixture scans and --fix', () => {
  it('detects multi-category slop in sloppy-hero.tsx and scores clean-card.tsx at 100', async () => {
    const sloppyPath = path.join(FIXTURES_DIR, 'sloppy-hero.tsx');
    const cleanPath = path.join(FIXTURES_DIR, 'clean-card.tsx');

    const sloppySummary = await scanTarget(sloppyPath);
    expect(sloppySummary.counts.COPY).toBeGreaterThan(0);
    expect(sloppySummary.counts.UI).toBeGreaterThan(0);
    expect(sloppySummary.counts.CODE).toBeGreaterThan(0);
    expect(sloppySummary.score).toBeLessThan(50);

    const cleanSummary = await scanTarget(cleanPath);
    expect(cleanSummary.findings).toHaveLength(0);
    expect(cleanSummary.score).toBe(100);
    expect(cleanSummary.grade).toBe('Principal Craft');
  });

  it('applies safe fixes cleanly with scanTarget --fix and preserves line endings', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'de-slop-fix-'));
    try {
      const sourcePath = path.join(FIXTURES_DIR, 'sloppy-hero.tsx');
      const targetPath = path.join(tempDir, 'sloppy-hero.tsx');
      const original = await fs.readFile(sourcePath, 'utf8');
      await fs.writeFile(targetPath, original, 'utf8');

      const before = await scanTarget(targetPath);
      const after = await scanTarget(targetPath, { fix: true });

      expect(after.fixedCount).toBeGreaterThanOrEqual(4);
      expect(after.score).toBeGreaterThan(before.score);

      const updatedContent = await fs.readFile(targetPath, 'utf8');
      expect(updatedContent).not.toContain('// Set state');
      expect(updatedContent).not.toContain('// Handle click');
      expect(updatedContent).not.toContain('Lorem ipsum dolor sit amet');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('preserves CRLF line endings when applying safe fixes', () => {
    const crlf = '// Set state\r\nconst count = 0;\r\nconst msg = "Delve into logs";\r\n';
    const findings = analyzeContent('crlf.ts', crlf);
    const { content, fixedCount } = applySafeFixes(crlf, findings);

    expect(fixedCount).toBe(2);
    expect(content).toBe('const count = 0;\r\nconst msg = "Inspect logs";\r\n');
  });

  it('scans multiple targets in a single invocation and deduplicates paths', async () => {
    const sloppyPath = path.join(FIXTURES_DIR, 'sloppy-hero.tsx');
    const cleanPath = path.join(FIXTURES_DIR, 'clean-card.tsx');

    const summary = await scanTarget([sloppyPath, cleanPath, cleanPath]);
    expect(summary.filesScanned).toBe(2);
    expect(summary.filesWithFindings).toBe(1);
  });
});
