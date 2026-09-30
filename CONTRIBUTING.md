# Contributing to Duck-UI

Thanks for wanting to help. Duck-UI is maintained by one person with a full-time job, so this guide exists to make sure your effort lands instead of stalling.

## The short version

1. **Open an issue before writing code** for anything bigger than a typo or an obvious small bug fix. Describe the problem and your intended approach. This is the single best way to avoid wasted work.
2. Keep PRs **small and focused**. One fix or one feature per PR.
3. Every bug fix needs a **regression test**. Every feature needs at least a happy-path test.
4. Don't refactor code you aren't touching, and don't swap out tooling (build system, linter, formatter). PRs that rewrite project infrastructure without prior discussion will be closed.

## Dev setup

```bash
bun install
bun run dev        # http://127.0.0.1:5173
```

Before pushing:

```bash
bun run lint           # svelte-check, warnings fail too
bun run format:check   # Prettier, gates CI
bun run typecheck      # svelte-check plus the config files
bun run test           # Vitest
bun run build          # Vite, the real check
bun run test:e2e       # Playwright against the build, needs Google Chrome locally
```

CI runs all of them. The e2e suite is the one that catches what the others cannot: a component that compiles but does not do what it says.

## Project layout

- `src/store/`: one framework-free store (`createStore.ts`), one slice per domain. Types in `src/store/types.ts`. Svelte reads it through `src/lib/stores/duck.svelte.ts`.
- `src/services/engine/` and `src/services/duckdb/`: DuckDB WASM, OPFS, HTTP and peer sessions.
- `src/services/persistence/`: IndexedDB persistence, repositories, crypto.
- `src/services/collaboration/`, `src/services/dashboard/`, `src/services/python/`: live sessions, dashboard documents, Pyodide kernel.
- `src/lib/`: framework free helpers (share codec, SQL sanitization, app config, Duck Brain providers).
- `src/lib/components/`: UI in Svelte 5. Shared primitives live in `src/lib/components/common/`, design tokens in `src/app.css`.
- `src/lib/routes.ts` and `src/lib/stores/router.svelte.ts`: pages and their sidebar sections.
- `src/lib/editor/`: CodeMirror theme, completion and the collaborative binding.
- `e2e/`: Playwright suite. Add a test here when a change is visible in the browser.
- Tests live in `__tests__/` directories next to the code they test, named `*.test.ts`.

More detail in `docs/architecture/`.

## Code conventions

- TypeScript strict mode, no `any`.
- Named exports over default exports.
- Svelte 5 runes only (`$props`, `$state`, `$derived`, `$effect`). No `export let`, no `svelte/store`.
- Tailwind for styling, colors only through the tokens in `src/app.css`. No custom CSS unless there's no other way.
- Logic stays in `src/store`, `src/services` and `src/lib`, free of Svelte imports. Components call store actions.
- Anything shown as HTML from a model or a shared document goes through `renderMarkdown` (marked plus DOMPurify).
- Screens that most sessions never open load on first use through `src/lib/components/common/Lazy.svelte`.
- Keep new files under ~500 lines. If your change makes a file bigger than that, split it.
- Escape all SQL values through `sqlEscapeString` / `sqlEscapeIdentifier` (`src/lib/sqlSanitize.ts`). Never interpolate user input into SQL directly.
- Unused variables are prefixed with `_`.

## Commits

Conventional commits: `type(scope): description`

```
fix(grid): render DECIMAL columns with correct scale
feat(brain): show token estimate before sending
```

## Reporting bugs

Include the query or file that triggers it, what you expected, what happened, browser and version, and whether you're on the hosted demo, Docker, or a local build. A screenshot of the console helps.

## What gets merged fast

Fixes with a failing-then-passing test, features that were discussed in an issue first, and anything on a `good first issue` label. Fast, in this repo, is often same-day.
