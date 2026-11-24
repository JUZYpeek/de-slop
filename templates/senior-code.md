# Senior Code Quality Rules

Write code optimized for the engineer reading it six months from now during an incident.

## 1. Comments Explain "Why", Never "What"

- **Ban Narrating Comments:** Never write comments that restate the next line (`// Set state`, `// Handle click`, `// Import dependencies`, `// Return JSX`, `// Helper function`).
- **Self-Documenting Naming:** Replace section comments with well-named helper functions (`validateWebhookSignature`, `formatInvoiceTotal`).
- **When to Comment:** Document only non-obvious invariants, protocol constraints, deliberate trade-offs, or external bug workarounds.

## 2. Control Flow & Error Handling

- **Early Returns & Guard Clauses:** Handle invalid inputs, missing permissions, and edge cases at the top of the function so the happy path stays flat at 1–2 indentation levels.
- **Ban Nested Ternaries:** Never chain `a ? b : c ? d : e`. Use a lookup map (`Record<Status, string>`), `switch` statement, or small pure helper.
- **Ban Empty `catch` Blocks:** Never swallow errors with `catch (err) {}`. Either handle recovery explicitly, log structured context, or rethrow a domain error.
- **Return Booleans Directly:** Write `return items.length > 0;` instead of `return items.length > 0 ? true : false;`.

## 3. Strict Typing & Module Boundaries

- **Zero `any`:** Never write `: any`, `as any`, or `Array<any>`. Model unknown external payloads as `unknown` and narrow them with runtime guards or schemas.
- **Discriminated Unions Over Optional Flag Soup:** Prefer `{ status: 'error'; error: Error } | { status: 'ok'; data: T }` over `{ loading?: boolean; error?: Error; data?: T }`.
- **No Unfinished Stubs:** Never leave `// TODO: implement`, `// ... rest of existing code`, or placeholder mocks in delivered files.
- **Remove Debug Artifacts:** Strip leftover `console.log` statements before finishing; use the project's structured logger where observability is intentional.
- **Focused Decomposition:** Extract reusable pure logic into small modules; keep UI components focused on state wiring and accessible markup.
