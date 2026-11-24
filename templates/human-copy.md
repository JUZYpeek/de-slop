# Human Copywriting Rules (Stripe / Linear Standard)

Write product copy, documentation, and microcopy as if an experienced staff engineer wrote it for peers: concise, concrete, calm, and verifiable.

## 1. Banned Words & Replacements

Never emit synthetic LLM marketing clichés in headings, buttons, tooltips, or README prose:

| Banned Word / Phrase | Why It Fails | Replace With |
| --- | --- | --- |
| `delve` / `delve into` | Strongest AI prose fingerprint | `inspect`, `read`, `trace`, `examine` |
| `unleash` / `unleash the power of` | Empty hype verb | Start with the action (`Automate`, `Run`, `Ship`) |
| `elevate` / `elevate your` | Vague corporate filler | `improve`, `speed up`, `simplify` |
| `seamless` / `seamlessly` | Means nothing without mechanism | Delete it, or describe the integration |
| `game-changer` / `game-changing` | Hyperbolic marketing noise | State the measurable difference |
| `revolutionize` / `transformative` | Unverifiable overclaim | Describe what replaced the manual step |
| `cutting-edge` / `next-gen` | Stale generic buzzword | Name the actual spec, model, or runtime |
| `harness the power` / `empower` | Inflated agency cliché | Name what the user controls directly |
| `tapestry` / `synergy` | Literary / boardroom AI slop | Plain concrete nouns |
| `robust` / `streamline` / `supercharge` | Vague filler adjectives/verbs | Concrete guarantees (`typed`, `cached`, `2x faster`) |
| `in today's fast-paced world` | Essay throat-clearing | Delete the entire sentence and start at step 1 |

## 2. Before / After Transformations

```text
BEFORE (AI Slop):
"Unleash the power of seamless workflow elevation! Delve into our
cutting-edge, all-in-one platform to supercharge your team's synergy."

AFTER (Senior Craft):
"Run automated preview checks on every pull request in under 12 seconds."
```

```text
BEFORE (Generic CTA):
"Get Started Today and Take Your Productivity to the Next Level!!"

AFTER (Specific CTA):
"Install CLI" / "Create workspace"
```

```text
BEFORE (Useless Error Toast):
"Oops! Something went wrong. Please try again."

AFTER (Diagnostic Error):
"Could not publish release v1.4.2: npm token expired. Run `npm login` and retry."
```

```text
BEFORE (Stock Personas & Placeholders):
"John Doe — VP at Acme Corp" / "Lorem ipsum dolor sit amet"

AFTER (Realistic Domain Fixtures):
Real attribution or domain-authentic sample records (e.g. "Hannah Lindqvist, Staff Infra Engineer").
```

## 3. Microcopy Discipline

- **Button Labels:** Use `<Verb> <Object>` (`Deploy branch`, `Export CSV`, `Revoke key`). Never use `Click here` or `Submit`.
- **Empty States:** Explain what belongs in the view and give one primary action to create it.
- **Punctuation:** Use calm, factual punctuation. Never stack exclamation marks (`!!`).
- **Numbers Over Adjectives:** Replace `"lightning fast"` with `"< 40ms p95"`, `"massive scale"` with `"10,000 req/s"`.
