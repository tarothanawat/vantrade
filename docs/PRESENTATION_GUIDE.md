# VanTrade — Presentation Guide (6 min)

---

## 3.1 What is your project?

**The Problem:** Retail traders want to use algorithmic strategies but can't code them. Strategy developers want to monetize their ideas but have no distribution channel.

**VanTrade solves this** by being a **strategy marketplace**: Providers publish parameterized trading Blueprints → Admins verify them → Testers subscribe and run them automatically against their own Alpaca Paper Trading accounts.

**Target Users — 3 roles:**
- **Provider** — quant/developer who builds and publishes strategies
- **Tester** — retail trader who subscribes and paper-trades
- **Admin** — platform moderator who verifies blueprints before they go public

**Scope:** Paper trading only (no real money, no HFT, no ML training).

---

## 3.2 Key Architecture Characteristics (Quality Attributes)

These are the three that actually drive design decisions:

**1. Modifiability / Extensibility**
The most important one. Two strategies (RSI and ICT), two trading modes, multiple timeframes, and a pluggable broker. Everything is designed to change without touching working code.

**2. Security**
Multi-tenant: every user's Alpaca credentials are encrypted at rest (AES-256-GCM) and decrypted only in memory at execution time. Never stored decrypted, never logged. RBAC enforced server-side via Guards — the client cannot lie about its role.

**3. Correctness / Testability**
All trading math is pure functions (no side effects, no I/O). This means they are trivially unit-testable. The test suite has ≥80% coverage on `apps/api/src/trading/` and tests run without a database or a real broker.

---

## 3.3 Architecture Style Chosen

Two complementary styles layered together:

### A) Hexagonal Architecture (Ports & Adapters) — trading subsystem

| Layer | File | Role |
|---|---|---|
| **Domain** | `trading/trading.engine.ts` | Pure functions only: `calculateRSI`, `generateSignal`, `generateIctSignal`, `detectOrderBlock`, `detectFairValueGap`, etc. Zero infrastructure imports. |
| **Port** | `IBrokerAdapter` (in `packages/types`) | The interface contract. `HeartbeatService` depends on THIS, not on Alpaca. |
| **Adapter** | `trading/broker/alpaca.adapter.ts` | THE ONLY FILE that imports `@alpacahq/alpaca-trade-api`. Implements `IBrokerAdapter`. Bound in `TradingModule` via DI token. |

### B) Modular Monolith — overall application structure

NestJS feature modules: `auth`, `blueprints`, `subscriptions`, `trading`, `heartbeat`, `api-keys`, `market-data`, `positions`, `encryption`, `prisma`.

Each module encapsulates its own controller → service → repository. They communicate through injected services, not direct imports.

### C) Repository Pattern — data access layer

Only `*.repository.ts` files touch Prisma. Services never import `PrismaService` directly. This gives a clean seam between business logic and persistence.

---

## 3.4 Why This Architecture Matches Your Requirements

**"How does hexagonal support extensibility?"**

The `IBrokerAdapter` interface defines 6 method signatures: `getHistoricalPrices`, `getLatestPrice`, `getRecentBars`, `placeOrder`, `placeOrderWithCredentials`, `getPositions*`, `verifyCredentials`. To add Interactive Brokers or Binance: write a new class implementing that interface, change one line in `TradingModule` (`useClass: BinanceAdapter`). Zero changes to `HeartbeatService`. Zero changes to domain logic.

**"How does it support correctness?"**

Pure functions have no state, no DI, no decorators. `calculateRSI([...prices], 14)` → deterministic output every time. Demonstrated in `trading.engine.spec.ts` — no mocks, no test setup, just math.

**"How does it support security?"**

`EncryptionService` uses AES-256-GCM with a randomly generated IV per encryption, so the same plaintext produces different ciphertext every time. Credentials are decrypted inside `HeartbeatService.processSub()` and passed as call-time arguments to `broker.placeOrderWithCredentials(orderParams, apiKey, apiSecret)` — never stored on the adapter instance. The adapter's `buildClient()` creates a short-lived Alpaca client per request and discards it.

---

## 3.5 How Design Ensures Code Quality

### Separation of Concerns — Thin Controller Pattern

```
Controller → validates input with ZodValidationPipe
           → calls ONE service method
           → returns result
```

No `if/else` in controllers. No Prisma in services. No SDK in repositories. Every route handler in `blueprints.controller.ts` is 1–3 lines.

### Validation — Two-Layer, One Source of Truth

- **API boundary:** `ZodValidationPipe` wraps Zod schemas from `@vantrade/types`. If the request does not match, it throws `BadRequestException` with field-level errors before the service is ever called.
- **API responses (web):** `apps/web/src/lib/api-client/base.ts` validates responses against the same shared schemas.
- **Shared schemas live in `packages/types`** — frontend and backend can never drift apart because they import from the same package.

### RBAC — Server Enforced

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
verify(@Param('id') id: string, ...) { ... }
```

The JWT payload carries the role; `RolesGuard` reads it from the verified token — the client cannot inject a fake role. Registration always assigns `Role.TESTER` — the code ignores any role in the request body.

### Error Handling

NestJS HTTP exceptions for business rule violations (`NotFoundException`, `ForbiddenException`, `ConflictException`). `HeartbeatService` wraps each subscription in its own `try/catch` so one user's bad API key cannot stop trading for everyone else — `Promise.allSettled` isolates failures per subscription.

### Naming Conventions

Strict and consistent throughout:

| Entity | Convention | Example |
|---|---|---|
| NestJS service | `<feature>.service.ts` | `blueprints.service.ts` |
| NestJS repository | `<feature>.repository.ts` | `blueprints.repository.ts` |
| Zod schema | `<Entity><Action>Schema` | `BlueprintCreateSchema` |
| Port interface | `I<Port>` | `IBrokerAdapter` |
| Adapter | `<Broker>Adapter` | `AlpacaAdapter` |

### Immutable Audit Log

`TradeLog` rows are append-only — no UPDATE or DELETE at the application layer. Enforced by simply not providing those methods in `TradeLogsRepository`. Every executed trade is permanently auditable.

---

## 3.6 Code Structure and Organization

### Monorepo Layout

```
packages/types/                      ← Shared contract (Zod schemas + TS interfaces)
    ├── schemas/                      ← BlueprintParametersSchema (RSI + ICT discriminated union)
    └── interfaces/                   ← IBrokerAdapter (the port)

apps/api/src/
    ├── <feature>/                    ← 11 self-contained feature modules
    │   ├── *.controller.ts           ← HTTP boundary, ZodValidationPipe, Guards
    │   ├── *.service.ts              ← Business logic
    │   └── *.repository.ts          ← Only file touching PrismaService
    ├── trading/
    │   ├── trading.engine.ts         ← Domain: pure functions, no decorators
    │   └── broker/
    │       ├── IBrokerAdapter.d.ts   ← Port definition
    │       └── alpaca.adapter.ts     ← ONLY Alpaca SDK import in the whole codebase
    ├── heartbeat/
    │   └── heartbeat.service.ts      ← @Cron tick, orchestrates RSI + ICT execution
    ├── encryption/                   ← AES-256-GCM, key derived via scrypt
    └── common/
        ├── pipes/zod-validation.pipe.ts
        └── interceptors/logging.interceptor.ts

apps/web/src/
    ├── app/(dashboard)/              ← Next.js pages (UI only, no business logic)
    ├── components/                   ← React components
    └── lib/api-client/               ← Typed fetch wrappers, one file per entity
```

### Database Schema (Prisma)

```
User ──< Blueprint   (one author → many blueprints)
User ──< Subscription
User ──< ApiKey      (AES-256-GCM encrypted at rest)

Blueprint ──< Subscription
Subscription ──< TradeLog   (append-only ledger)
```

### Heartbeat Execution Loop

Every 60 seconds (`@Cron('*/60 * * * * *')`):

1. Fetch all `isActive = true` subscriptions
2. For each subscription (parallel, isolated):
   - Parse blueprint parameters → route to `processRsiSub` or `processIctSub`
   - Fetch user's encrypted `ApiKey`, decrypt in memory
   - Fetch market bars via `IBrokerAdapter.getRecentBars()`
   - Run pure domain functions (`calculateRSI` / `generateIctSignal`)
   - If signal is `BUY` or `SELL` → call `IBrokerAdapter.placeOrderWithCredentials()`
   - Persist outcome to `TradeLog` (regardless of signal)
3. Failures are isolated per subscription via `Promise.allSettled`

---

## Professor's Likely Questions — Answers

### "What if I want to change the broker from Alpaca to Interactive Brokers?"

Write `InteractiveBrokersAdapter` implementing `IBrokerAdapter`. Change one line in `trading.module.ts`:

```typescript
{ provide: 'IBrokerAdapter', useClass: InteractiveBrokersAdapter }
```

Zero changes to `HeartbeatService`. Zero changes to domain logic. This is exactly what the Port & Adapter pattern is designed for. The architectural constraint is enforced by rule — `alpaca.adapter.ts` is the only file that imports the Alpaca SDK.

### "What if I want to add a new trading strategy (e.g., MACD)?"

Three additive steps:

1. Add `MacdParametersSchema` to `packages/types/src/schemas/blueprint.schema.ts` and include it in the `BlueprintParametersSchema` discriminated union.
2. Add `calculateMACD()` as a pure function in `trading.engine.ts`.
3. Add a `processMacdSub()` branch in `HeartbeatService.processSub()`.

No existing code changes. The discriminated union (`z.discriminatedUnion('strategyType', [...])`) means adding a new case is purely additive. RSI and ICT already coexist this way — `processSub()` routes by `params.strategyType`.

### "Why not microservices?"

Scope does not justify it. Paper trading on a marketplace does not need independent deployability or separate scaling of individual features. A modular monolith gives the same separation of concerns (each feature is its own NestJS module with clear boundaries) with far less operational complexity. If VanTrade grew to production scale, `HeartbeatService` could be extracted to its own service without rewriting — the `IBrokerAdapter` port and `SubscriptionsRepository` interface are already the natural split seams.

### "Why not event-driven architecture?"

The heartbeat execution is already time-driven (60-second cron), not event-triggered. There is no meaningful async event between components that would benefit from a message bus. `Promise.allSettled` provides the parallelism needed without Kafka or RabbitMQ overhead. For the current scope, adding a broker would introduce failure modes without adding value.

### "Why Hexagonal and not just plain Layered Architecture?"

Classic layered (Controller → Service → Repository) does not define what to do at external system boundaries. Hexagonal adds the Port so the service layer depends on an abstraction, not on the SDK. In plain layered architecture, `HeartbeatService` would import `AlpacaAdapter` directly — swapping brokers means changing the service. With the port, the service never knows Alpaca exists.

### "How does your architecture support multi-tenancy?"

Each subscription carries a `userId`. Every `HeartbeatService.processSub()` fetches that user's encrypted `ApiKey`, decrypts it, and passes it as a per-request argument to `placeOrderWithCredentials`. There is no shared broker session. Each user's orders go to their own Alpaca paper account. One user's bad credentials throw only within their own `try/catch` block.

---

## Quick-Reference Numbers

| Metric | Value |
|---|---|
| NestJS feature modules | 11 |
| Files that import the Alpaca SDK | 1 (`alpaca.adapter.ts`) |
| Files that import Prisma per feature | 1 (the repository) |
| Trading strategies | 2 (RSI + ICT/Smart Money Concepts) |
| Domain pure functions | 12+ (`calculateRSI`, `calculateSMA`, `generateSignal`, `generateIctSignal`, `detectSwingPoints`, `detectMarketStructure`, `detectOrderBlock`, `detectFairValueGap`, `classifyPriceZone`, `hasLiquiditySweep`, `checkLimitOrderFill`, `aggregateBars`) |
| Encryption algorithm | AES-256-GCM with random IV per encryption |
| Test coverage target | ≥80% on `apps/api/src/trading/` |
| TradeLog mutability | Append-only (no UPDATE / DELETE ever) |
