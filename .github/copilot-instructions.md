# GitHub Copilot Instructions — VanTrade

> These instructions are automatically applied to every Copilot interaction in this repository.
> Always read `AGENTS.md` at the repo root for full architecture context.

---

## Project Identity

You are working on **VanTrade**, a multi-tenant algorithmic trading strategy marketplace. It is a **pnpm monorepo (Turborepo)** with two apps:

- `apps/api` — **NestJS** backend — owns all business logic, Prisma, Alpaca SDK
- `apps/web` — **Next.js 14** frontend — UI only, calls the NestJS REST API
- `packages/types` — shared Zod schemas and TypeScript interfaces used by both apps

It follows a **Hexagonal (Ports & Adapters) architecture** with strict separation of concerns.

---

## Absolute Prohibitions

- **Never** import Prisma outside of `apps/api/src/**/*.repository.ts` files.
- **Never** import the Alpaca SDK outside of `apps/api/src/trading/broker/alpaca.adapter.ts`.
- **Never** hardcode secrets, API keys, or encryption keys — always use `process.env`.
- **Never** write business logic inside `apps/web` — it is UI only. All logic lives in `apps/api`.
- **Never** add Route Handlers or Server Actions to `apps/web` — there is no `src/app/api/` folder in the web app.
- **Never** use `any` in TypeScript. Use explicit types or generics.
- **Never** write impure functions (functions with side effects) for trading calculations.
- **Never** add UPDATE or DELETE operations on the `TradeLog` table — it is an append-only immutable ledger.
- **Never** trust the client for RBAC decisions — always enforce roles in the NestJS API with Guards.

---

## Always Do

- **Always** validate external input with a **Zod schema** — use `ZodValidationPipe` on NestJS controllers; validate API responses in the web app's API client.
- **Always** use guard clauses and early returns to keep nesting depth ≤ 3.
- **Always** place trading calculations (RSI, MA, PnL) as **pure functions** in `apps/api/src/trading/trading.engine.ts`.
- **Always** access the database through the co-located `*.repository.ts` in `apps/api`.
- **Always** interact with Alpaca through `IBrokerAdapter` (the port interface) — never the SDK directly.
- **Always** encrypt Alpaca API keys with AES-256-GCM before persisting them.
- **Always** include unit tests for any new pure function in `apps/api/src/trading/`.
- **Always** enforce RBAC on every NestJS controller using `@UseGuards(JwtAuthGuard, RolesGuard)` and the `@Roles()` decorator.

---

## File Placement Rules

| What you're writing | Where it goes |
|---|---|
| Page or layout UI | `apps/web/src/app/(dashboard)/...` |
| Reusable UI component | `apps/web/src/components/` |
| API client (fetch wrapper) | `apps/web/src/lib/api-client/<entity>.client.ts` |
| NestJS controller | `apps/api/src/<feature>/<feature>.controller.ts` |
| Business / domain logic | `apps/api/src/<feature>/<feature>.service.ts` |
| Database query | `apps/api/src/<feature>/<feature>.repository.ts` |
| Broker integration code | `apps/api/src/trading/broker/alpaca.adapter.ts` |
| Encryption utilities | `apps/api/src/encryption/encryption.service.ts` |
| Heartbeat cron service | `apps/api/src/heartbeat/heartbeat.service.ts` |
| Zod schema (shared) | `packages/types/src/schemas/<entity>.schema.ts` |
| TypeScript interface (shared) | `packages/types/src/interfaces/` |

---

## Thin Controller Pattern (NestJS)

Every NestJS controller must follow this exact shape — nothing more:

```typescript
// apps/api/src/blueprints/blueprints.controller.ts
import { Controller, Post, Delete, Param, Body, Request, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BlueprintCreateSchema } from '@vantrade/types';
import { BlueprintsService } from './blueprints.service';
import type { BlueprintCreateDto, AuthRequest } from '@vantrade/types';

@Controller('blueprints')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BlueprintsController {
  constructor(private readonly blueprintsService: BlueprintsService) {}

  @Post()
  @Roles('PROVIDER')
  @UsePipes(new ZodValidationPipe(BlueprintCreateSchema))
  create(@Body() dto: BlueprintCreateDto, @Request() req: AuthRequest) {
    return this.blueprintsService.create(dto, req.user.id); // delegate — nothing else
  }
}
```

---

## IBrokerAdapter Interface (Always Use This)

```typescript
// packages/types/src/interfaces/IBrokerAdapter.ts  ← THE PORT
export interface IBrokerAdapter {
  getLatestPrice(symbol: string): Promise<number>;
  placeOrder(params: OrderParams): Promise<OrderResult>;
  getPositions(accountId: string): Promise<Position[]>;
}
```

`TradingEngine` and `HeartbeatService` inject `IBrokerAdapter` via NestJS DI token `'IBrokerAdapter'` — never the concrete `AlpacaAdapter` class directly. The binding is declared once in `TradingModule`.

---

## Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| NestJS controller | `<feature>.controller.ts` | `blueprints.controller.ts` |
| NestJS service (domain) | `<feature>.service.ts` | `blueprints.service.ts` |
| NestJS repository | `<feature>.repository.ts` | `blueprints.repository.ts` |
| NestJS module | `<feature>.module.ts` | `blueprints.module.ts` |
| Zod schema | `<Entity><Action>Schema` | `BlueprintCreateSchema`, `ApiKeySchema` |
| Adapter | `<Broker>Adapter` | `AlpacaAdapter` |
| Port interface | `I<Port>` | `IBrokerAdapter` |
| React component | PascalCase | `BlueprintCard.tsx`, `PnLChart.tsx` |
| API client (web) | `<entity>.client.ts` | `blueprints.client.ts` |

---

## RBAC Role Summary

| Role | Key Permissions |
|---|---|
| `PROVIDER` | Create/edit/delete own Blueprints |
| `TESTER` | Subscribe to Blueprints, view own PnL and trade logs |
| `ADMIN` | Verify Blueprints, view all audit logs |

---

## Error Handling Style

Use `ZodValidationPipe` for validation errors (throws `BadRequestException` automatically). Use NestJS built-in HTTP exceptions (`ConflictException`, `NotFoundException`, `ForbiddenException`) for business rule violations. Keep try/catch only in `HeartbeatService` for error isolation.

```typescript
// ✅ Correct — flat, no deep nesting, NestJS exceptions
@Injectable()
export class BlueprintsService {
  constructor(private readonly repo: BlueprintsRepository) {}

  async create(data: BlueprintCreateDto, userId: string) {
    const existing = await this.repo.findByTitle(data.title, userId);
    if (existing) throw new ConflictException('Blueprint with this title already exists');
    return this.repo.create({ ...data, authorId: userId });
  }
}
```

---

## Test Requirements

- Unit test every pure function in `apps/api/src/trading/trading.engine.ts`.
- Test file lives next to the source file: `trading.engine.spec.ts` beside `trading.engine.ts`.
- Use **Jest** (NestJS default) — mock all I/O (repository calls, adapter calls) using NestJS testing utilities (`createTestingModule`).
- Minimum **80% line coverage** across `apps/api/src/trading/`.
- Service-level tests mock the repository. Controller-level tests use supertest against the full NestJS app.
