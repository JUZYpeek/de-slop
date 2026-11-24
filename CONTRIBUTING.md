# Contributing to `de-slop`

Contributions are welcome — especially high-signal detection rules with near-zero false positives, refined rule templates, and sharper auto-fixes.

## Local Setup

Requires Node.js `>= 18`.

```bash
git clone https://github.com/JUZYpeek/de-slop.git
cd de-slop
npm install
npm run build
npm test
```

## Adding a New Detection Rule

Every rule implements `AnalyzerRule` from `src/types.ts` and lives in one of three modules:

| Category | File | What Belongs Here |
| --- | --- | --- |
| `COPY` | `src/analyzer/copyRules.ts` | Synthetic LLM buzzwords, generic CTAs, unreplaced placeholders, tone slop |
| `UI` | `src/analyzer/uiRules.ts` | Default purple-indigo gradients, bloated card chrome, `transition-all`, layout-thrashing animations, stock personas |
| `CODE` | `src/analyzer/codeRules.ts` | Narrating comments, empty `catch` blocks, nested ternaries, explicit `any`, unfinished stubs |

### Rule Authoring Standards

1. **Naming:** Use `<category>/<kebab-case-name>` (for example, `ui/gradient-text-slop` or `code/empty-catch`).
2. **Severity discipline:**
   - `high` — Clear production defect or unmistakable AI template fingerprint (empty `catch`, explicit `any`, purple-indigo default gradient, `Lorem ipsum`).
   - `medium` — Structural craft issue (buzzwords, narrating comments, `transition-all`, bloated card chrome).
   - `low` — Minor hygiene issue (stacked `!`, stray `console.log`, missing `prefers-reduced-motion`).
3. **Actionable output:** Every finding must include both `reason` (why it reads as generated slop) and `suggestion` (a concrete Senior Fix the developer can apply immediately).
4. **Zero-risk auto-fixes:** Only attach a `fix` (`delete-line` or `replace-match`) when the edit is 100% syntactically safe and preserves valid TypeScript, JSX, HTML, CSS, or Markdown. Never guess refactors that can change runtime behavior.
5. **Respect syntax context:**
   - Copy rules must run on extracted prose/string segments (`extractCopySegments`) rather than raw identifiers or fenced code blocks.
   - Code rules must strip strings and comments before matching syntax tokens so comments or prose never false-positive.

### Example Rule Skeleton

```ts
{
  id: 'code/example-rule',
  category: 'CODE',
  severity: 'medium',
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  analyze(ctx) {
    const findings: Finding[] = [];
    for (let i = 0; i < ctx.lines.length; i++) {
      const line = ctx.lines[i] ?? '';
      // Match pattern and push Finding with 1-based line and column
    }
    return findings;
  },
}
```

## Adding Test Fixtures & Unit Tests

Every new rule requires two kinds of coverage in `tests/scan.test.ts`:

1. **Positive cases** proving the rule flags realistic AI-slop snippets at the right line and column (and verifying `applySafeFixes` if `fix` is provided).
2. **Negative cases** proving legitimate senior code, TypeScript syntax (`foo?: string`, `a?.b ?? c`), or technical prose does **not** trigger false positives.

If the pattern affects end-to-end component craft, update or add fixtures under `tests/fixtures/` (`sloppy-hero.tsx` for slop baselines, `clean-card.tsx` for the `100 / 100` clean baseline).

## Updating Prompt Rule Templates

Templates live in `templates/` (`base-craft.md`, `ui-and-motion.md`, `human-copy.md`, `senior-code.md`). Keep rules short, opinionated, and concrete. Wrap banned example words in inline backticks or fenced code blocks so `templates/` keeps a `100 / 100` Craft Score.

## Pre-PR Checklist

Run the full verification pipeline locally before opening a pull request:

```bash
npm run typecheck
npm run build
npm test
node bin/cli.js scan src templates README.md CONTRIBUTING.md --min-score 95
```
