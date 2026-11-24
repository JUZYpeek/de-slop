# UI, Layout & Motion Rules

## 1. Color, Surfaces & Elevation

- **Ban the AI Hero Default:** Never use `bg-gradient-to-r from-purple-500 to-indigo-600`, `from-indigo-500 via-purple-500 to-pink-500`, or decorative `blur-3xl` neon background blobs.
- **Ban Rainbow Gradient Text:** Never combine `bg-clip-text text-transparent` with multi-stop purple/pink/cyan gradients on headings. Use solid, high-contrast ink (`text-neutral-950 dark:text-neutral-50`).
- **Build Surface Hierarchy with Borders:**
  - Light mode: `bg-white` canvas, `bg-neutral-50` inset wells, `border border-neutral-200/80` crisp `1px` borders, `shadow-sm` only when elevation carries semantic meaning (menus, popovers, sticky headers).
  - Dark mode: `bg-neutral-950` canvas, `bg-neutral-900` raised cards, `border border-white/10` hairline edges instead of glowing drop shadows.
- **Ban Puffy Card Chrome:** Never pair `rounded-3xl` with `shadow-2xl` or `backdrop-blur-2xl`. Use a restrained radius scale (`rounded-md` for inputs/buttons, `rounded-lg` or `rounded-xl` for cards/modals).
- **One Accent Color:** Commit to a single functional accent for primary actions and active states. Reserve semantic colors (`red`, `amber`, `emerald`) strictly for status feedback.

## 2. Typography & Spacing Discipline

- **Scale & Tracking:** Pair crisp display headings (`tracking-tight font-semibold`) with readable body lines (`max-w-[65ch] leading-relaxed`).
- **Tabular Numbers:** Always apply `tabular-nums` on metrics, pricing tables, timestamps, and counters so layout never jitters during updates.
- **Intentional Spacing Scale:** Stick to a `4px`/`8px` rhythm (`gap-2`, `gap-4`, `p-4`, `p-6`, `py-16`). Give cards generous internal breathing room and clear visual separation between metadata, primary title, and action row.
- **Accessible Contrast:** Maintain at least `4.5:1` contrast for body copy and `3:1` for large text and UI borders/icons (WCAG AA). Never put muted gray text (`text-neutral-400`) on mid-gray surfaces.

## 3. Interactive States & Tactile Feedback

Every button, link, and control must handle all operational states explicitly:

- **Default:** Clear affordance and unambiguous label (`Save changes`, not `Submit`).
- **Hover:** Crisp contrast shift (`hover:bg-neutral-800` or `hover:border-neutral-300`), never exaggerated `hover:scale-110` or `hover:-translate-y-2` jumps.
- **Active / Pressed:** Subtle physical press (`active:scale-[0.98]`).
- **Focus Visible:** Keyboard ring (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2`). Never suppress focus outlines without replacing them.
- **Disabled & Loading:** `disabled:opacity-50 disabled:pointer-events-none` plus an inline spinner or progress text while async mutations run.

## 4. Motion & Performance Standards

- **GPU-Composited Properties Only:** Animate exclusively `transform` and `opacity`. Never animate `width`, `height`, `top`, `left`, `margin`, or `padding`.
- **Ban `transition-all`:** Always specify exact properties (`transition-colors duration-150 ease-out` or `transition-transform duration-150 ease-out`).
- **Crisp Timing:** Micro-interactions belong in `120–180ms` with `ease-out` or subtle spring curves (`cubic-bezier(0.16, 1, 0.3, 1)`). Ban `animate-bounce` and perpetual decorative loops.
- **Reduced Motion:** Guard keyframe animations and transitions with `@media (prefers-reduced-motion: reduce)` or Tailwind `motion-reduce:transition-none motion-reduce:animate-none`.
