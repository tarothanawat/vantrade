# AGENTS.md — VanTrade Codebase Reference

> **All AI agents working in this repository must read this file first.**
> It defines the project context, architecture decisions, folder contracts, naming conventions, and code quality rules that every file must comply with.

---

## 1. Project Overview

**VanTrade** is a multi-tenant algorithmic strategy marketplace (a "Social Quant Lab").

- **Strategy Providers** publish parameterized trading Blueprints.
- **Strategy Testers** subscribe to Blueprints and execute them against their personal Alpaca Paper Trading accounts.
- **Compliance Admins** verify Blueprints and audit platform health.

The system acts as secure middleware: it decouples *strategy logic* from *brokerage execution* so that users never need to run local infrastructure.

**Excluded from scope:** live/real-money trading, HFT, ML/AI model training.

---

## 2. Technology Stack

VanTrade is a **monorepo** with two independently deployable applications managed by **pnpm workspaces + Turborepo**.

### Monorepo Layout
```
vantrade/
├── apps/
│   ├── web/        # Next.js 14 — UI only, no business logic
│   └── api/        # NestJS — all business logic, REST API
├── packages/
│   └── types/      # Shared Zod schemas + TypeScript interfaces
├── prisma/
│   └── schema.prisma
└── turbo.json
```

### `apps/api` — NestJS Backend

| Layer | Technology | Notes |
|---|---|---|
| Framework | NestJS | Module/DI system enforces Hexagonal Architecture |
| ORM | Prisma | All DB access via Repository layer only |
| Database | PostgreSQL | Multi-tenant relational model |
| Broker API | Alpaca Trade API SDK | Accessed only through `AlpacaAdapter` |
| Auth | JWT + Passport.js | `JwtAuthGuard` on every protected route |
| RBAC | NestJS `RolesGuard` + `@Roles()` decorator | Enforced at controller level |
| Encryption | AES-256-GCM | For Alpaca API key storage at rest |
| Validation | Zod (`ZodValidationPipe`) | At every controller boundary |
| Cron | `@nestjs/schedule` | `@Cron` decorator for heartbeat service |
| Language | TypeScript (strict mode) | No `any`, no implicit returns |

### `apps/web` — Next.js 14 Frontend

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router) | UI and routing only — no Route Handlers, no Server Actions |
| Data Fetching | REST calls to `apps/api` | All via typed API client using shared Zod schemas |
| Auth | JWT stored in HttpOnly cookie | Passed as `Authorization: Bearer` header to API |
| Language | TypeScript (strict mode) | No `any` |

### `packages/types` — Shared Package

| What lives here | Examples |
|---|---|
| Zod request/response schemas | `BlueprintCreateSchema`, `TradeLogSchema` |
| TypeScript interfaces | `IBrokerAdapter`, `Blueprint`, `TradeLog` |
| Enum types | `Role`, `OrderSide` |

---

## 3. Canonical Folder Structure

### `apps/api` — NestJS Backend

```
apps/api/src/
├── blueprints/                        # Feature module (NestJS module pattern)
│   ├── blueprints.controller.ts       # Thin controller — parse, validate, delegate
│   ├── blueprints.service.ts          # Domain logic
│   ├── blueprints.repository.ts       # Prisma queries — ONLY file that touches DB
│   └── blueprints.module.ts           # Wires DI together
│
├── subscriptions/                     # Feature module
│   ├── subscriptions.controller.ts
│   ├── subscriptions.service.ts
│   ├── subscriptions.repository.ts
│   └── subscriptions.module.ts
│
├── trade-logs/                        # Append-only trade log persistence
│   ├── trade-logs.repository.ts       # ONLY file that writes TradeLog rows
│   └── trade-logs.module.ts
│
├── trading/                           # ★ Core trading logic — The "City Center"
│   ├── trading.engine.ts              # Pure functions: RSI, MA, signal generation
│   ├── trading.engine.test.ts         # Unit tests (co-located)
│   └── broker/
│       ├── IBrokerAdapter.ts          # THE PORT — interface only (re-exports from @vantrade/types)
│       └── alpaca.adapter.ts          # THE ADAPTER — implements IBrokerAdapter
│
├── heartbeat/                         # Autonomous execution loop
│   ├── heartbeat.service.ts           # @Cron('*/60 * * * * *') job
│   └── heartbeat.module.ts
│
├── auth/                              # JWT strategy + guards
│   ├── jwt.strategy.ts
│   ├── jwt-auth.guard.ts
│   ├── roles.guard.ts
│   └── roles.decorator.ts             # @Roles('PROVIDER') decorator
│
├── encryption/                        # AES-256-GCM key vault utilities
│   └── encryption.service.ts
│
└── app.module.ts                      # Root module
```

**Contract:** No code outside `*.repository.ts` files may import Prisma's `db` client.
**Contract:** No code outside `alpaca.adapter.ts` may import the Alpaca SDK.
**Contract:** `trading.engine.ts` must only import from `packages/types` — never from infrastructure.
**Contract:** `HeartbeatService` must inject `TradeLogsRepository` for all `TradeLog` writes — never `PrismaService` directly.
**Contract:** `IBrokerAdapter` is the only type `HeartbeatService` may reference for broker calls — no casting to concrete adapter classes.

### `apps/web` — Next.js 14 Frontend

```
apps/web/src/
├── app/                               # Next.js App Router — routing + UI ONLY
│   ├── (auth)/                        # Login, Register pages
│   └── (dashboard)/                   # Protected user dashboards
│       ├── marketplace/               # Blueprint browser
│       ├── subscriptions/             # Tester's active bots
│       └── admin/                     # Admin audit views
│
├── components/                        # Reusable UI atoms — no business logic
│   ├── ui/                            # Generic (Button, Card, Modal, Table)
│   ├── marketplace/                   # Blueprint-specific display components
│   └── dashboard/                     # Charts, PnL widgets
│
└── lib/
    └── api-client/                    # Typed fetch wrappers for NestJS REST API
        ├── blueprints.client.ts
        ├── subscriptions.client.ts
        └── auth.client.ts
```

**Contract:** `apps/web` has **no** `src/app/api/` folder, no Route Handlers, no Server Actions.
**Contract:** `apps/web` never imports Prisma or any backend infrastructure package.

### `packages/types` — Shared Types

```
packages/types/src/
├── schemas/                           # Zod schemas (used by both apps)
│   ├── blueprint.schema.ts
│   ├── subscription.schema.ts
│   ├── api-key.schema.ts
│   └── trade-log.schema.ts
└── interfaces/                        # TypeScript interfaces
    ├── IBrokerAdapter.ts
    └── index.ts
```

---

## 4. Database Schema (Prisma)

Core entities and their relationships:

```prisma
model User {
  id            String         @id @default(cuid())
  email         String         @unique
  passwordHash  String
  role          Role           @default(TESTER)
  createdAt     DateTime       @default(now())
  blueprints    Blueprint[]
  subscriptions Subscription[]
  apiKeys       ApiKey[]
}

enum Role {
  PROVIDER
  TESTER
  ADMIN
}

model Blueprint {
  id          String       @id @default(cuid())
  title       String
  description String
  parameters  Json         // RSI levels, MA periods, etc.
  isVerified  Boolean      @default(false)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  authorId    String
  author      User         @relation(fields: [authorId], references: [id])
  subscriptions Subscription[]
}

model Subscription {
  id          String        @id @default(cuid())
  isActive    Boolean       @default(true)
  createdAt   DateTime      @default(now())
  userId      String
  blueprintId String
  user        User          @relation(fields: [userId], references: [id])
  blueprint   Blueprint     @relation(fields: [blueprintId], references: [id])
  tradeLogs   TradeLog[]
}

model ApiKey {
  id             String   @id @default(cuid())
  encryptedKey   String   // AES-256 ciphertext
  encryptedSecret String  // AES-256 ciphertext
  broker         String   @default("alpaca")
  userId         String   @unique
  user           User     @relation(fields: [userId], references: [id])
}

model TradeLog {
  id             String       @id @default(cuid())
  symbol         String
  side           String       // "buy" | "sell"
  quantity       Float
  price          Float
  pnl            Float?
  status         String
  executedAt     DateTime     @default(now())
  subscriptionId String
  subscription   Subscription @relation(fields: [subscriptionId], references: [id])
}
```

---

## 5. Architecture Rules (Non-Negotiable)

### 5.1 Thin Controllers
NestJS controllers in `apps/api/src/**/*.controller.ts` do **only** three things:
1. Parse and validate the request body with a Zod `ValidationPipe`.
2. Call exactly one method on the injected service.
3. Return the result (NestJS serializes to JSON automatically).

❌ **Never** place `if/else` business logic, Prisma calls, or SDK calls inside a controller.

```typescript
// apps/api/src/blueprints/blueprints.controller.ts
@Controller('blueprints')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BlueprintsController {
  constructor(private readonly blueprintsService: BlueprintsService) {}

  @Post()
  @Roles('PROVIDER')
  @UsePipes(new ZodValidationPipe(BlueprintCreateSchema))
  create(@Body() dto: BlueprintCreateDto, @Request() req: AuthRequest) {
    return this.blueprintsService.create(dto, req.user.id);
  }
}
```

### 5.2 Hexagonal Architecture — Ports and Adapters
The Trading Engine in `apps/api/src/trading/` must depend on the interface `IBrokerAdapter`, **not** the Alpaca SDK.
NestJS's DI container injects the concrete `AlpacaAdapter` — the engine never imports it directly.

```typescript
// packages/types/src/interfaces/IBrokerAdapter.ts  ← THE PORT
export interface BrokerCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface IBrokerAdapter {
  /** Fetch the last `limit` close prices for RSI/MA calculation (oldest → newest). */
  getHistoricalPrices(symbol: string, limit: number): Promise<number[]>;
  /** Convenience wrapper — single most recent close price. */
  getLatestPrice(symbol: string): Promise<number>;
  /** Place a market order using the caller-supplied per-user credentials. */
  placeOrder(params: OrderParams, credentials: BrokerCredentials): Promise<OrderResult>;
  /** Fetch open positions using the user's own credentials. */
  getPositions(accountId: string, credentials: BrokerCredentials): Promise<Position[]>;
}

// apps/api/src/trading/broker/alpaca.adapter.ts  ← THE ADAPTER
@Injectable()
export class AlpacaAdapter implements IBrokerAdapter { ... }
```

**Rule:** `BrokerCredentials` are passed as arguments at call time — the adapter is a stateless singleton. Never store decrypted credentials on the adapter instance.

To swap to a different broker, write a new `IBKRAdapter` and rebind `'IBrokerAdapter'` in the module — zero changes to domain logic.

### 5.3 Repository Pattern
One `*.repository.ts` file per feature module. Only repository files use Prisma. Repositories are `@Injectable()` NestJS services injected into their sibling service.

```typescript
// apps/api/src/blueprints/blueprints.repository.ts
@Injectable()
export class BlueprintsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllVerified() {
    return this.prisma.blueprint.findMany({ where: { isVerified: true } });
  }

  findById(id: string) {
    return this.prisma.blueprint.findUnique({ where: { id } });
  }

  create(data: CreateBlueprintDto) {
    return this.prisma.blueprint.create({ data });
  }
}
```

### 5.4 Zod Validation at Every Boundary
Validate at the edge — API inputs, environment variables, external API responses.
Use `ZodValidationPipe` at the controller level so validation happens before the service is called.

```typescript
// ZodValidationPipe — reusable pipe in apps/api/src/common/pipes/
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    return result.data;
  }
}

// Applied per-route — fail fast, flat, no nested try/catch
@Post()
@UsePipes(new ZodValidationPipe(BlueprintCreateSchema))
create(@Body() dto: BlueprintCreateDto) { ... }
```

### 5.5 Pure Functions for Trading Logic
All mathematical calculations (PnL, Moving Averages, RSI) must be pure functions in `apps/api/src/trading/trading.engine.ts`.
The `TradingEngine` service wraps these pure functions and handles DI concerns — the pure functions themselves have no decorators or imports.

```typescript
// ✅ Pure — no side effects, fully testable, no NestJS decorators
export function calculateRSI(prices: number[], period: number): number { ... }
export function shouldBuy(rsi: number, lowerBound: number): boolean { ... }
export function calculatePnL(entryPrice: number, exitPrice: number, qty: number): number { ... }
```

### 5.6 Encryption Rules
- Alpaca API keys are encrypted with AES-256-GCM **before** being written to the database.
- The encryption key is read from environment variable `ENCRYPTION_KEY` (never hard-coded).
- Decryption happens only inside `apps/api/src/encryption/encryption.service.ts` — never in the web app.

---

## 6. Role-Based Access Control (RBAC)

| Action | PROVIDER | TESTER | ADMIN |
|---|---|---|---|
| Create/Edit own Blueprint | ✅ | ❌ | ❌ |
| Delete own Blueprint | ✅ | ❌ | ❌ |
| View Blueprint marketplace | ✅ | ✅ | ✅ |
| Create/Delete own Subscription | ❌ | ✅ | ❌ |
| View own trade logs + PnL | ❌ | ✅ | ❌ |
| Verify/Reject Blueprint | ❌ | ❌ | ✅ |
| View all audit logs | ❌ | ❌ | ✅ |

RBAC is enforced in the NestJS API using `JwtAuthGuard` + `RolesGuard` on every controller. The `@Roles()` decorator declares the required role per route. The web app UI may hide elements, but this is cosmetic only — the API enforces all access control.

```typescript
// apps/api/src/auth/roles.decorator.ts
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

// Applied to every protected endpoint
@Delete(':id')
@Roles('PROVIDER')
remove(@Param('id') id: string, @Request() req: AuthRequest) {
  return this.blueprintsService.remove(id, req.user.id);
}
```

---

## 7. Heartbeat Execution Loop

**Location:** `apps/api/src/heartbeat/heartbeat.service.ts`
**Trigger:** `@Cron('*/60 * * * * *')` from `@nestjs/schedule`

**Sequence (every 60 seconds):**
1. Query all `Subscription` records where `isActive = true`.
2. For each subscription, decrypt the user's `ApiKey` via `EncryptionService` into `BrokerCredentials`.
3. Call `IBrokerAdapter.getHistoricalPrices(symbol, rsiPeriod + 1)` to fetch enough bars for RSI.
4. Apply `calculateRSI()` + `generateSignal()` pure functions to produce a signal (`buy | sell | hold`).
5. If signal is `buy` or `sell`, call `IBrokerAdapter.placeOrder(params, credentials)` with the user's own credentials.
6. Persist the outcome via `TradeLogsRepository` regardless of signal.

**Critical invariants:**
- `getHistoricalPrices` must return at least `rsiPeriod + 1` bars — fewer bars means RSI cannot be computed and the subscription is skipped with a warning.
- Credentials are decrypted in-memory and never stored or logged.
- `placeOrder` uses per-user credentials — never the system Alpaca account.

**Error isolation:** A failure in one subscription must not stop processing of other subscriptions. Each subscription is wrapped in its own try/catch.

```typescript
// apps/api/src/heartbeat/heartbeat.service.ts
@Injectable()
export class HeartbeatService {
  constructor(
    @Inject('IBrokerAdapter') private readonly broker: IBrokerAdapter,
    private readonly subscriptionsRepo: SubscriptionsRepository,
    private readonly tradeLogsRepo: TradeLogsRepository,  // ← repository, NOT PrismaService
    private readonly encryptionService: EncryptionService,
  ) {}

  @Cron('*/60 * * * * *')
  async tick() {
    const active = await this.subscriptionsRepo.findAllActive();
    await Promise.allSettled(active.map(sub => this.processSub(sub)));
  }

  private async processSub(sub: ActiveSubscription) {
    try {
      const credentials: BrokerCredentials = {
        apiKey: this.encryptionService.decrypt(sub.user.apiKeys[0].encryptedKey),
        apiSecret: this.encryptionService.decrypt(sub.user.apiKeys[0].encryptedSecret),
      };
      // getHistoricalPrices (not getLatestPrice) → calculateRSI → generateSignal → placeOrder → tradeLogsRepo.create
    } catch (err) {
      // log error, continue — do NOT rethrow
    }
  }
}
```

---

## 8. Security Checklist

- [ ] All environment secrets loaded via `process.env` and validated with Zod at startup.
- [ ] JWT tokens validated on every protected route server-side.
- [ ] Alpaca keys encrypted (AES-256-GCM) before DB write; decrypted only at execution time.
- [ ] User inputs sanitized with Zod — no raw SQL, no `eval()`.
- [ ] RBAC checked on the server — never trust the client for role.
- [ ] Trade logs are append-only (no UPDATE or DELETE on `TradeLog`).
- [ ] Rate-limit public endpoints (`/auth/register`, `/auth/login`) to prevent abuse.
- [ ] Registration always assigns `Role.TESTER` — role is never accepted from the request body. Privileged roles (PROVIDER, ADMIN) are assigned by an administrator only.

---

## 9. Code Quality Targets (CodeCharta Goals)

| Metric | Target | Implementation |
|---|---|---|
| Cyclomatic Complexity | Low (short buildings) | Thin Controllers + Pure Functions |
| Lines of Code per file | < 200 | Repository Pattern |
| Nesting Depth | ≤ 3 levels | Zod early-exit + guard clauses |
| Test Coverage | ≥ 80% | Unit tests on all domain pure functions |
| Coupling | Low | Hexagonal Architecture / IBrokerAdapter |

---

## 10. Environment Variables

### `apps/api/.env`
```bash
# Never commit to version control
DATABASE_URL="postgresql://..."
ENCRYPTION_KEY="<32-byte-hex-string>"     # AES-256 key for API key vault
JWT_SECRET="<random-256-bit-string>"
ALPACA_API_KEY="<paper-trading-key>"      # Only for system-level health checks
ALPACA_API_SECRET="<paper-trading-secret>"
PORT=4000
```

### `apps/web/.env.local`
```bash
# Never commit to version control
NEXT_PUBLIC_API_URL="http://localhost:4000"  # NestJS API base URL
```

---

## 11. Development Commands

```bash
# Install all workspace dependencies (run from repo root)
pnpm install

# Run database migrations
pnpm --filter api prisma:migrate

# Seed the database
pnpm --filter api prisma:seed

# Start both apps in dev mode (Turborepo parallel)
pnpm dev

# Start only the API
pnpm --filter api dev

# Start only the web app
pnpm --filter web dev

# Run all unit tests
pnpm test

# Run tests with coverage (must hit ≥80% on apps/api/src/trading/)
pnpm test:coverage

# Build all apps for production
pnpm build
```

### Ports
| App | Default Port |
|---|---|
| `apps/api` (NestJS) | `4000` |
| `apps/web` (Next.js) | `3000` |
