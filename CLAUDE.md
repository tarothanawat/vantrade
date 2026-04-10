# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**VanTrade** is a multi-tenant algorithmic trading strategy marketplace. Strategy **Providers** publish parameterized trading Blueprints; **Testers** subscribe and execute them against their personal Alpaca Paper Trading accounts; **Admins** verify Blueprints and audit the platform.

Scope is limited to paper trading — no live/real-money trading, HFT, or ML/AI model training.

---

## Commands

```bash
# Install all workspace dependencies (run from repo root)
pnpm install

# Database setup
pnpm --filter api prisma:migrate   # Run pending migrations
pnpm --filter api prisma:seed      # Seed test users (see below)
pnpm --filter api prisma:studio    # Open Prisma Studio GUI

# Development
pnpm dev                           # Run both apps in parallel (Turborepo)
pnpm --filter api dev              # API only — http://localhost:4000
pnpm --filter web dev              # Web only — http://localhost:3000

# Testing
pnpm test                          # All tests
pnpm test:coverage                 # With coverage (≥80% required on apps/api/src/trading/)
pnpm --filter api test             # API tests only
pnpm --filter web test             # Web tests only

# Build & lint
pnpm build
pnpm lint
pnpm format                        # Prettier — **/*.{ts,tsx,json,md}
```

**Seeded test users** (created by `prisma:seed`):

| Email | Password | Role |
|---|---|---|
| admin@vantrade.io | Admin1234! | ADMIN |
| provider@vantrade.io | Provider1234! | PROVIDER |
| tester@vantrade.io | Tester1234! | TESTER |

**Environment setup:**
- Copy `apps/api/.env.example` → `apps/api/.env` (requires `DATABASE_URL`, `ENCRYPTION_KEY`, `JWT_SECRET`, `ALPACA_API_KEY`, `ALPACA_API_SECRET`, `WEB_URL`, `PORT=4000`)
- Copy `apps/web/.env.local.example` → `apps/web/.env.local` (requires `NEXT_PUBLIC_API_URL=http://localhost:4000`)

---

## Architecture

### Monorepo Structure

pnpm workspaces + Turborepo orchestration with three packages:

- **`apps/api`** — NestJS backend; owns all business logic, Prisma, Alpaca SDK
- **`apps/web`** — Next.js 14 frontend; UI only, no business logic, no Route Handlers, no Server Actions
- **`packages/types`** — Shared Zod schemas and TypeScript interfaces used by both apps (imported as `@vantrade/types`)

### Hexagonal (Ports & Adapters) Architecture

The trading subsystem enforces strict separation via three layers:

1. **Domain** (`apps/api/src/trading/trading.engine.ts`) — Pure functions only (`calculateRSI`, `calculateSMA`, `generateSignal`, `calculatePnL`). No decorators, no infrastructure imports, only imports from `@vantrade/types`.

2. **Port** (`IBrokerAdapter` interface in `packages/types`) — The contract `HeartbeatService` depends on. Injected via DI token `'IBrokerAdapter'`.

3. **Adapter** (`apps/api/src/trading/broker/alpaca.adapter.ts`) — The **only** file that imports the Alpaca SDK. Implements `IBrokerAdapter`. Bound in `TradingModule`.

To swap brokers: write a new adapter, rebind `'IBrokerAdapter'` — zero changes to domain logic.

### Repository Pattern

One `*.repository.ts` per feature module. **Only repository files** may import Prisma/use `PrismaService`. No controller or service touches the DB directly.

### NestJS Feature Modules

Each feature follows: `<feature>.controller.ts` → `<feature>.service.ts` → `<feature>.repository.ts` → `<feature>.module.ts`

Feature modules: `auth`, `blueprints`, `subscriptions`, `trade-logs`, `api-keys`, `trading`, `heartbeat`, `market-data`, `encryption`, `prisma`.

### Heartbeat Execution Loop

`apps/api/src/heartbeat/heartbeat.service.ts` — `@Cron('*/60 * * * * *')` runs every 60 seconds:

1. Fetch all `isActive = true` subscriptions
2. Decrypt user's `ApiKey` via `EncryptionService` into `BrokerCredentials` (in-memory only, never stored/logged)
3. Call `IBrokerAdapter.getHistoricalPrices()` to fetch bars for RSI calculation
4. Apply `calculateRSI()` + `generateSignal()` pure functions
5. If signal is `buy`/`sell`, call `IBrokerAdapter.placeOrder()` with per-user credentials
6. Persist outcome via `TradeLogsRepository` (regardless of signal)

Each subscription runs in its own try/catch — `Promise.allSettled` ensures one failure doesn't stop others.

### Web Frontend

`apps/web/src/lib/api-client/` contains typed fetch wrappers (one file per entity) that call the NestJS REST API. All auth state comes from JWT in an HttpOnly cookie passed as `Authorization: Bearer`.

---

## Non-Negotiable Rules

### Absolute Prohibitions

- **Never** import Prisma outside `apps/api/src/**/*.repository.ts`
- **Never** import the Alpaca SDK outside `apps/api/src/trading/broker/alpaca.adapter.ts`
- **Never** write business logic inside `apps/web` — UI only
- **Never** add `any` types — use explicit types or generics
- **Never** write impure functions for trading calculations
- **Never** UPDATE or DELETE `TradeLog` rows — it is an append-only immutable ledger
- **Never** trust the client for RBAC — always enforce roles in the NestJS API via Guards
- **Never** store decrypted credentials on the adapter instance — pass `BrokerCredentials` as call-time arguments

### Thin Controller Pattern

NestJS controllers do exactly three things: (1) validate with `ZodValidationPipe`, (2) call one method on the injected service, (3) return the result. No `if/else`, no Prisma, no SDK calls inside controllers.

### Validation

Use `ZodValidationPipe` on every NestJS controller boundary. Validate API responses in the web app's API client. Use guard clauses + early returns to keep nesting ≤ 3 levels.

### Error Handling

Use NestJS HTTP exceptions (`ConflictException`, `NotFoundException`, `ForbiddenException`) for business rule violations. Keep try/catch only in `HeartbeatService` for error isolation per subscription.

### RBAC

Every protected NestJS controller uses `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles()`. Registration always assigns `Role.TESTER` — role is never accepted from the request body. Privileged roles (PROVIDER, ADMIN) are assigned by an admin only.

---

## File Placement

| What you're writing | Where it goes |
|---|---|
| Page/layout UI | `apps/web/src/app/(dashboard)/...` |
| Reusable UI component | `apps/web/src/components/` |
| API client fetch wrapper | `apps/web/src/lib/api-client/<entity>.client.ts` |
| NestJS controller | `apps/api/src/<feature>/<feature>.controller.ts` |
| Business/domain logic | `apps/api/src/<feature>/<feature>.service.ts` |
| Database query | `apps/api/src/<feature>/<feature>.repository.ts` |
| Broker integration | `apps/api/src/trading/broker/alpaca.adapter.ts` |
| Trading pure functions | `apps/api/src/trading/trading.engine.ts` |
| Zod schema (shared) | `packages/types/src/schemas/<entity>.schema.ts` |
| TypeScript interface (shared) | `packages/types/src/interfaces/` |

---

## Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| NestJS service | `<feature>.service.ts` | `blueprints.service.ts` |
| NestJS repository | `<feature>.repository.ts` | `blueprints.repository.ts` |
| Zod schema | `<Entity><Action>Schema` | `BlueprintCreateSchema` |
| Adapter | `<Broker>Adapter` | `AlpacaAdapter` |
| Port interface | `I<Port>` | `IBrokerAdapter` |
| React component | PascalCase | `BlueprintCard.tsx` |
| API client (web) | `<entity>.client.ts` | `blueprints.client.ts` |

---

## Testing

- Test files: `*.spec.ts` co-located with source (e.g., `trading.engine.spec.ts` beside `trading.engine.ts`)
- Unit test every pure function in `trading.engine.ts`
- Service-level tests mock the repository; controller-level tests use supertest against the full NestJS app
- Minimum **80% line coverage** across `apps/api/src/trading/`
