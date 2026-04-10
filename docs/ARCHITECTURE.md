# VanTrade Architecture Summary

This document justifies the architectural practices applied in VanTrade, a multi-tenant algorithmic trading strategy marketplace built for the Software Architecture course. Each section maps a concrete architectural decision to the files and code where it is implemented.

---

## 1. Monorepo with Turborepo (Workspace Architecture)

**Pattern:** Multi-package monorepo with orchestrated builds.

VanTrade is organized as a single repository containing three independently deployable packages managed by **pnpm workspaces** and **Turborepo**:

```
vantrade/
├── apps/api/          NestJS REST API  (port 4000)
├── apps/web/          Next.js frontend (port 3000)
└── packages/types/    Shared Zod schemas + TypeScript interfaces
```

**Why it matters:**
- Code sharing without a separate npm package publish step — `@vantrade/types` is resolved locally via workspace linking.
- Turborepo caches build artifacts (`turbo.json`) so unchanged packages are not rebuilt.
- A single `pnpm install` at the root wires everything together.

**Key file:** `turbo.json`, `pnpm-workspace.yaml`

---

## 2. Hexagonal Architecture (Ports & Adapters)

**Pattern:** Domain logic is isolated from infrastructure via explicit port interfaces and swappable adapters.

The trading subsystem enforces three strict layers:

### 2.1 Domain Layer — Pure Functions

**File:** `apps/api/src/trading/trading.engine.ts`

Contains only pure, stateless functions with zero infrastructure imports:

| Function | Purpose |
|---|---|
| `calculateRSI(prices, period)` | Wilder's smoothing RSI |
| `calculateSMA(prices, period)` | Simple Moving Average |
| `generateSignal(rsi, buy, sell)` | BUY / SELL / HOLD decision |
| `calculatePnL(entry, exit, qty, side)` | Realised profit/loss |
| `calculateUnrealisedPnL(...)` | Mark-to-market PnL |

Because these are pure functions, they are fully unit-testable without any database or network mock.

### 2.2 Port — IBrokerAdapter Interface

**File:** `packages/types/src/interfaces/IBrokerAdapter.ts`

```typescript
export interface IBrokerAdapter {
  getHistoricalPrices(symbol: string, limit: number): Promise<number[]>;
  getLatestPrice(symbol: string): Promise<number>;
  getRecentBars(symbol, timeframe, limit): Promise<MarketBarDto[]>;
  placeOrder(params: OrderParams): Promise<OrderResult>;
  placeOrderWithCredentials(params, key, secret): Promise<OrderResult>;
  getPositions(accountId: string): Promise<Position[]>;
}
```

The `HeartbeatService` depends on this interface, **not** on Alpaca. The interface lives in `packages/types` (not in `apps/api`) so it has no dependency on any broker SDK.

### 2.3 Adapter — AlpacaAdapter

**File:** `apps/api/src/trading/broker/alpaca.adapter.ts`

The **only** file in the entire codebase that imports `@alpacahq/alpaca-trade-api`. Implements all six methods of `IBrokerAdapter`. Handles:
- Symbol normalization (AAPL, BTCUSD, BTC/USD)
- Multiple timeframes (1Min → 1Day)
- System credentials for read-only market data vs. per-user credentials for order execution

### 2.4 Binding via Dependency Injection

**File:** `apps/api/src/trading/trading.module.ts`

```typescript
@Module({
  providers: [{ provide: 'IBrokerAdapter', useClass: AlpacaAdapter }],
  exports: ['IBrokerAdapter'],
})
```

To swap to a different broker, only this binding changes — zero modifications to domain logic or the heartbeat service.

---

## 3. Repository Pattern

**Pattern:** Each feature module owns a dedicated repository class that is the sole point of database access.

**Rule enforced:** Only `*.repository.ts` files may import `PrismaService`. No controller or service touches the database directly.

| Repository | File | Responsibility |
|---|---|---|
| `SubscriptionsRepository` | `subscriptions/subscriptions.repository.ts` | CRUD + `findAllActive()` for heartbeat |
| `TradeLogsRepository` | `trade-logs/trade-logs.repository.ts` | Append-only trade log writes and reads |
| `BlueprintsRepository` | `blueprints/blueprints.repository.ts` | Marketplace CRUD + admin queries |
| `ApiKeysRepository` | `api-keys/api-keys.repository.ts` | Encrypted credential storage |
| `AuthRepository` | `auth/auth.repository.ts` | User lookup and creation |

**PrismaModule** is declared `@Global()` in `apps/api/src/prisma/prisma.module.ts` so `PrismaService` is injected into repositories without requiring explicit module imports everywhere.

---

## 4. Layered NestJS Feature Modules

**Pattern:** Vertical slice architecture — each feature is a self-contained module with Controller → Service → Repository.

The API contains **10 feature modules**, each following the same structure:

```
<feature>.controller.ts   HTTP boundary, validates input, calls service
<feature>.service.ts      Business logic, orchestration
<feature>.repository.ts   Database queries (Prisma only)
<feature>.module.ts       DI wiring
```

| Module | Role |
|---|---|
| `AuthModule` | JWT login/register, Passport strategy |
| `BlueprintsModule` | Marketplace CRUD, admin verification gate |
| `SubscriptionsModule` | Subscribe/unsubscribe, toggle active |
| `TradingModule` | Exports `IBrokerAdapter` DI token |
| `HeartbeatModule` | Background cron execution engine |
| `EncryptionModule` | AES-256-GCM key encryption/decryption |
| `ApiKeysModule` | Broker credential management |
| `MarketDataModule` | Real-time price endpoint for UI |
| `TradeLogsModule` | Exports `TradeLogsRepository` |
| `PrismaModule` | Global database connection |

**Thin Controller Rule:** Controllers do exactly three things — validate with `ZodValidationPipe`, call one service method, return the result. No conditionals, no Prisma, no SDK calls inside controllers.

---

## 5. Background Processing — Heartbeat Execution Loop

**Pattern:** Event-driven scheduling (cron-based) with fault-isolated concurrent execution.

**File:** `apps/api/src/heartbeat/heartbeat.service.ts`

The heartbeat is the core engine that executes all active trading subscriptions on a recurring schedule:

```
@Cron('*/60 * * * * *')  ← fires every 60 seconds
tick()
 └── findAllActive() subscriptions
     └── Promise.allSettled()  ← parallel, fault-isolated
         └── processSub(sub) per subscription
             1. Validate blueprint parameters (Zod)
             2. Check market hours (stocks: 9:30–16:00 ET; crypto: 24/7)
             3. Check timeframe boundary alignment
             4. Fetch recent OHLCV bars via IBrokerAdapter
             5. calculateRSI() — pure domain function
             6. generateSignal() — pure domain function
             7. Enforce alternation (BUY→SELL→BUY, no double-buy)
             8. Decrypt user API keys via EncryptionService
             9. placeOrderWithCredentials() via IBrokerAdapter
            10. Persist TradeLog (append-only)
```

**`Promise.allSettled()`** ensures that a failure in one subscription (e.g., invalid credentials, network error) does not block or cancel execution for all other subscriptions.

---

## 6. Shared Type Package — Single Source of Truth

**Pattern:** Contract-first design with a shared types package consumed by both backend and frontend.

**Package:** `packages/types` (imported as `@vantrade/types`)

```
src/
├── enums.ts                Role, OrderSide, TradeSignal, OrderStatus
├── interfaces/
│   ├── IBrokerAdapter.ts   Port interface + broker-related types
│   └── index.ts            JwtPayload, BlueprintParameters, MarketBarDto, ...
└── schemas/                Zod validation schemas (reused on both sides)
    ├── auth.schema.ts
    ├── blueprint.schema.ts
    ├── subscription.schema.ts
    ├── trade-log.schema.ts
    └── ...
```

Zod schemas are defined **once** and used:
- In **NestJS controllers** (`ZodValidationPipe`) to validate incoming request bodies.
- In the **web API client** (`base.ts`) to parse and validate API responses at runtime.

This eliminates duplicated type definitions and ensures both apps agree on the same contract.

---

## 7. Typed API Client Layer (Frontend)

**Pattern:** Adapter pattern on the frontend — typed fetch wrappers isolate HTTP concerns from UI components.

**Directory:** `apps/web/src/lib/api-client/`

Every entity has its own client file:

| Client | File |
|---|---|
| Auth | `auth.client.ts` |
| Blueprints | `blueprints.client.ts` |
| Subscriptions | `subscriptions.client.ts` |
| API Keys | `api-keys.client.ts` |
| Market Data | `market-data.client.ts` |
| Trade Logs | `trade-logs.client.ts` |

All clients use a shared generic `apiClient` from `base.ts`:

```typescript
async function request<T>(
  path: string,
  options: RequestInit,
  token?: string,
  schema?: ZodType<T>,
): Promise<T>
```

- Attaches `Authorization: Bearer` header automatically.
- Parses responses through the corresponding Zod schema — any unexpected shape throws an error immediately.
- Raises `ApiError` with HTTP status code on non-2xx responses.

React pages import named client functions, not `fetch` directly. This means HTTP logic is in one place and pages contain only UI concerns.

---

## 8. Authentication & Authorization

**Pattern:** Stateless JWT authentication + declarative Role-Based Access Control (RBAC) with NestJS Guards.

### 8.1 Authentication

**Files:** `auth/jwt.strategy.ts`, `auth/jwt-auth.guard.ts`

- On login, the API signs a JWT containing `{ sub, email, role }` and returns it.
- The web app stores the token and passes it as `Authorization: Bearer <token>` on every request.
- `JwtStrategy` (Passport) validates the token and attaches the decoded payload to `req.user`.

### 8.2 Role-Based Access Control

**Files:** `auth/roles.guard.ts`, `auth/roles.decorator.ts`

```typescript
@Get('admin/all')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
findAll() { ... }
```

- `@Roles(Role.X)` attaches metadata to the route handler.
- `RolesGuard` reads `req.user.role` from the JWT payload and compares it to the required role.
- **Roles are never accepted from the request body** — registration always assigns `Role.TESTER`.

| Role | What they can do |
|---|---|
| `TESTER` | Browse verified blueprints, subscribe, manage API keys |
| `PROVIDER` | All TESTER permissions + create/edit/delete own blueprints |
| `ADMIN` | All permissions + verify blueprints, view all data |

---

## 9. Security — Encrypted Credential Storage

**Pattern:** Encrypt-at-rest with in-memory-only decryption.

**File:** `apps/api/src/encryption/encryption.service.ts`

Broker API keys are sensitive and must never be stored in plaintext or appear in logs.

- **Algorithm:** AES-256-GCM (authenticated encryption — detects tampering)
- **Key derivation:** `scrypt` from the `ENCRYPTION_KEY` environment variable
- **Storage format:** `iv:authTag:ciphertext` (all hex) in the `ApiKey` table
- **Decryption:** Happens inside `HeartbeatService.processSub()`, in memory, immediately before the order is placed. The decrypted key is passed as a function argument — **never stored on the adapter instance**.

---

## 10. Append-Only Audit Log

**Pattern:** Immutable event ledger.

**File:** `apps/api/src/trade-logs/trade-logs.repository.ts`

`TradeLog` rows are never updated or deleted. The repository exposes only:
- `create(data)` — insert a new record
- `findBySubscription(id)` — read records
- `findLatestTradeSideBySubscription(id)` — used to enforce trade alternation

This is enforced at the application layer: no `update` or `delete` methods exist on `TradeLogsRepository`. Any trade execution — including errors and HOLD signals — is logged, providing a complete, tamper-evident audit trail.

---

## 11. Validation Pipeline

**Pattern:** Parse, don't validate — schemas as the contract at every system boundary.

Every controller endpoint is protected by a `ZodValidationPipe`:

```typescript
@Post()
@UsePipes(new ZodValidationPipe(SubscriptionCreateSchema))
create(@Body() dto: SubscriptionCreateDto, @Req() req: AuthRequest) {
  return this.subscriptionsService.create(req.user.sub, dto);
}
```

Zod schemas are sourced from `@vantrade/types` (never duplicated), ensuring backend and frontend always validate against the same shape. On parse failure, the pipe throws `BadRequestException` with the Zod error details.

---

## 12. Testing Strategy

**Pattern:** Test pyramid — pure unit tests at the domain layer, integration-style mocks at the service layer.

### Domain Layer (Pure Functions)

**File:** `apps/api/src/trading/trading.engine.spec.ts`

No mocks needed. Tests call `calculateRSI`, `generateSignal`, `calculatePnL`, etc. directly with known inputs and verify outputs. Edge cases: insufficient data, all-gain/loss sequences, boundary RSI values.

### Service Layer (HeartbeatService)

**File:** `apps/api/src/heartbeat/heartbeat.service.spec.ts`

Uses `@nestjs/testing` `Test.createTestingModule()` with mocked repositories, broker adapter, and encryption service. Tests cover: market hours logic, timeframe alignment, RSI thresholds, alternation enforcement, error isolation per subscription, credential decryption flow.

### Frontend API Client

**File:** `apps/web/src/lib/api-client/base.spec.ts`

Tests the generic fetch wrapper: Zod schema validation on response, `ApiError` raised on non-2xx, 204 No Content handling, authorization header injection.

**Coverage target:** ≥ 80% line coverage on `apps/api/src/trading/`.

---

## Architecture Decision Summary

| Architecture Practice | Where Applied |
|---|---|
| Hexagonal / Ports & Adapters | `IBrokerAdapter` port + `AlpacaAdapter` + `trading.engine.ts` |
| Repository Pattern | One `*.repository.ts` per feature, sole Prisma access point |
| Layered Feature Modules | 10 NestJS modules (Controller → Service → Repository) |
| Thin Controller | Controllers: validate → call service → return |
| Shared Contract Package | `packages/types` — Zod schemas + interfaces used by both apps |
| Dependency Injection | NestJS DI container; `IBrokerAdapter` token for broker swap |
| Role-Based Access Control | `JwtAuthGuard` + `RolesGuard` + `@Roles()` decorator |
| Background Scheduling | `@Cron` heartbeat with `Promise.allSettled()` fault isolation |
| Encrypt-at-Rest | AES-256-GCM for broker credentials; decrypt in-memory only |
| Append-Only Ledger | `TradeLog` — no update/delete methods in repository |
| End-to-End Type Safety | TypeScript + Zod from DB schema to React component |
| Monorepo Orchestration | Turborepo build cache + pnpm workspaces |
