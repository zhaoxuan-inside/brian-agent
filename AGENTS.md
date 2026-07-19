# Brian-Agent

## Monorepo (npm workspaces)

Three packages under root: `backend/`, `frontend/`, `shared/`.

Root commands:
```
npm run dev          # starts backend + frontend concurrently
npm run build        # builds backend then frontend (shared NOT included — build separately if needed)
npm run test         # runs backend tests only (frontend has no test script)
npm run lint         # lints backend then frontend
```

## Backend (`@brian-agent/backend`)

- **Stack**: Express 4, TypeScript, CommonJS (`tsconfig.json` module: CommonJS)
- **Entry**: `src/main.ts` → `src/app.ts` (DI wiring hub)
- **Dev**: `npm run dev` (`tsx watch src/main.ts` — auto-restart on change)
- **Build**: `tsc` outputs to `dist/`
- **Tests**: `vitest run` (all under `tests/`, mirrors `src/` layout, `*.test.ts`)
  - `vitest` w/ supertest for HTTP route tests
  - Conventions: `BRIAN_*` env vars set in `beforeEach` / cleaned in `afterEach`, temp dirs via `fs.mkdtempSync()`
  - Single-fork mode (`singleFork: true, threads: false` in vitest.config.ts)
- **Config**: Zod-schema-validated; `BRIAN_*` env vars override file config at `./data/model-config.json`
- **Backend has its own `src/shared/`** (types, errors) — separate from the workspace `shared/` package
- **Key env vars**: `BRIAN_PORT` (8000), `BRIAN_HOST` (127.0.0.1), `BRIAN_DB_PATH`, `BRIAN_LOG_LEVEL`, `BRIAN_LLM_*`, `BRIAN_AGENT_*`, etc. See `src/infrastructure/config.ts` for full list.
- `data/` dir (SQLite DB, graph files, logs) is gitignored — deleted between clean checkouts
- **Graph DB backends**: detected from env vars `BRIAN_USE_SQLITE_GRAPH`, `BRIAN_USE_MEMORY_GRAPH`, defaults to TinyGraphDB

### Architecture notes

- Many PRD-planned modules consolidated into single files (e.g., `core/information/index.ts`, `core/learning/index.ts` at ~1256 lines)
- `cognitive/information/` dir exists but is **empty** — all memory logic is in `core/information/`
- Route `/api/memory` maps to `core/information` service (route file is `memory.ts`, not `information.ts`)
- Agent framework uses MetaAgent → AgentLibrary → AgentBuilder pattern with strategy dispatch (`agent/strategy/`)

## Frontend (`@brian-agent/frontend`)

- **Stack**: Vue 3, Pinia, Vue Router, Vite, Tailwind CSS
- **Dev**: `npm run dev` — Vite on port 5173, proxies `/api` → `http://localhost:8000`, `/ws` → `ws://localhost:8000`
- **Build**: `vue-tsc && vite build` (typecheck step runs first — can be slow)
- **No tests** (no test script in package.json)
- **Lint**: ESLint with `vue-eslint-parser`, covers `.vue` files
- Resolves `@shared/*` directly to `../shared/src/` via Vite alias — no pre-build of shared package needed for dev
- Design system: Apple-inspired custom Tailwind theme (`brian-blue`, `apple-gray`, `apple-dark` colors)

## `@brian-agent/shared`

- Zod schemas + TypeScript types, shared between packages (mainly consumed by frontend)
- Build separately: `npm run build --workspace=shared` (or `npm run build -w shared`)
- Backend has its own parallel `src/shared/` — does NOT depend on this package

## Testing

```
npm run test              # all backend tests
npm run test -w backend   # same
npx vitest run tests/routes/chat.test.ts   # single test file
```

All backend tests run with `singleFork: true` (no parallel threads). 30s timeout per test.

## Files to know

| File | Purpose |
|------|---------|
| `PRD-Background.md` | Comprehensive design doc (ambitious; not all reflected in code) |
| `docs/` | Supplementary docs (API spec, test reports, UI spec) |
| `backend/src/infrastructure/config.ts` | Zod config schema + `BRIAN_*` env mapping |
| `backend/src/app.ts` | Service wiring hub — all DI happens here |
| `backend.old/` | Previous version of the backend (keep for reference) |

## Constraints

- No CI/CD present
- No `.env` files tracked in git
- Frontend typecheck (`vue-tsc`) is required before build but is separate from lint
- `backend.old/` is an older codebase — prefer modifying `backend/`
