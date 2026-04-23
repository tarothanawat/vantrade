# VanTrade — Presentation Script (6 min)

> **Pacing note:** Don't rush slides 5 and 6 — those are the ones the professor scores hardest.
> Target ~330–340 seconds of actual speech to leave buffer for slide transitions and natural pauses.

---

## Slide 1 — Title *(~10 sec)*

"Hi, I'm Thanawat. Today I'm presenting VanTrade — an algorithmic trading strategy marketplace."

---

## Slide 2 — What is VanTrade? *(~40 sec)*

"The problem is simple: retail traders want to run algorithmic strategies, but they don't have the skills to build and host them. VanTrade bridges that gap.

Three types of users. Providers write and publish trading blueprints. Testers pick a blueprint, subscribe, and it runs automatically on their own Alpaca paper trading account. Admins review and approve blueprints before they go public.

The whole system is scoped to paper trading — no real money, no HFT."

---

## Slide 3 — Key Architecture Characteristics *(~40 sec)*

"Five characteristics drove every decision in this system.

Security — users hand us their brokerage credentials. A breach doesn't just leak data, it exposes real accounts. Reliability — one user's bad API key must never block anyone else's trade. Auditability — every order, every hold, every error must be permanently on record. Maintainability — swapping the broker from Alpaca to something else should not touch a single line of financial calculation code. And Testability — trading math must be provably correct, not just assumed from live runs."

---

## Slide 4 — System Architecture *(~30 sec)*

"The overall system is a Modular Monolith — one deployable unit, but with clearly separated modules inside. The frontend is Next.js, the backend is NestJS on port 4000. Both share a package called @vantrade/types — one source of truth for schemas on both sides. Backend talks to PostgreSQL via Prisma, and to Alpaca via its SDK. One deployment, one database — we call this a single architectural quantum. Simple to reason about, simple to operate."

---

## Slide 5 — Ports & Adapters *(~50 sec)*

"Inside the backend, the trading subsystem uses the Ports and Adapters pattern — and this is the most important decision we made.

The Domain layer, trading.engine.ts, contains only pure functions. calculateRSI, generateSignal, all the ICT logic. No infrastructure imports, no framework decorators — just math.

The Port — IBrokerAdapter — is the interface contract. HeartbeatService depends on this interface. It has no idea what broker it's talking to.

The Adapter — alpaca.adapter.ts — is the only file in the entire codebase that imports the Alpaca SDK. It implements the port.

So to swap to Interactive Brokers or Binance — you write a new adapter, change one line in TradingModule, and nothing else changes. The domain logic stays untouched."

---

## Slide 6 — How Architecture Supports Requirements *(~45 sec)*

"Let me show how each characteristic is directly addressed in code.

Security: credentials are encrypted at rest with AES-256-GCM and decrypted only in memory at execution time — that's EncryptionService. Roles are enforced server-side via RolesGuard — the client cannot self-assign a role.

Reliability: HeartbeatService uses Promise.allSettled — if one subscription crashes, every other user keeps trading.

Auditability: TradeLog is append-only — there is no UPDATE and no DELETE method anywhere in TradeLogsRepository. Every tick is permanent.

Maintainability: IBrokerAdapter port — broker swap equals one line change.

Testability: pure domain functions, no mocks needed."

---

## Slide 7 — Code Quality: Separation of Concerns *(~25 sec)*

"Every HTTP request passes through exactly three layers. The controller validates input with ZodValidationPipe and calls one service method — nothing else. The service handles business logic with no database access and no SDK calls. The repository is the only file that touches Prisma.

This isn't a team convention — it's enforced structurally. If you break it, the compiler catches it."

---

## Slide 8 — Code Quality: Validation, Testing & Naming *(~25 sec)*

"Validation has one source of truth. Zod schemas live in @vantrade/types, imported by both the API and the frontend. They literally cannot drift apart.

Testing — because trading functions are pure, we hit over 80% coverage with zero mocks and no live broker needed.

Naming conventions are strict. Every file's role is readable from its filename: blueprints.service.ts, blueprints.repository.ts, IBrokerAdapter, AlpacaAdapter."

---

## Slide 9 — Code Structure: 3-Layer Organization *(~20 sec)*

"The internal structure has three layers. Interface — controllers, the entry point for all requests. Domain and Application — feature services, plus shared services like Trading and Encryption. Persistence — repositories own all Prisma access, nothing else touches the database. Broker calls always go through the IBrokerAdapter port."

---

## Slide 10 — Feature Module Breakdown *(~20 sec)*

"The backend has 11 feature modules. Most follow the full controller-service-repository pattern. Two exceptions worth noting: TradingModule has no controller — it only exports the IBrokerAdapter DI token. TradeLogsModule has no controller either — it's append-only, written exclusively by HeartbeatService."

---

## Slide 11 — Database Schema *(~25 sec)*

"The schema is intentionally simple. Users author Blueprints and own encrypted ApiKeys. A Subscription links a User to a Blueprint and generates TradeLogs.

Two design choices visible in the schema: ApiKey stores encryptedKey and encryptedSecret — AES-256-GCM, never plain text. TradeLog has executedAt but no updatedAt — by design, because it's append-only."

---

## Slide 12 — CodeCharta Analysis *(~25 sec)*

"CodeCharta visualizes coupling across the codebase. Almost everything is small and green — low complexity, low coupling. The one orange file is alpaca.adapter.ts. It's highlighted because it has the most connections.

But this is intentional coupling. It imports the SDK, it implements the port, it handles symbol resolution. Everything that needs to touch Alpaca is contained in exactly one place — that's the whole point of the pattern working correctly."

---

## Slide 13 — Q&A *(~10 sec)*

"To summarize — Modular Monolith for simplicity, Ports and Adapters for broker flexibility and testability, Repository Pattern for persistence isolation, Append-only Ledger for audit, AES-256-GCM for security, and RBAC Guards because role escalation in a trading system is a direct financial risk.

Happy to take any questions."

---

## Expected Professor Questions — Quick Answers

**"What if you want to change the broker?"**
> Write a new adapter implementing IBrokerAdapter, change one line in TradingModule. Zero changes to domain logic or HeartbeatService.

**"What if you want to add a new strategy, like MACD?"**
> Add MacdParametersSchema to the discriminated union in @vantrade/types, add the pure calculation function in trading.engine.ts, add a processMacdSub branch in HeartbeatService. Purely additive — no existing code changes.

**"Why not microservices?"**
> The scope doesn't justify it. A modular monolith gives the same separation of concerns with far less operational complexity. If the system needed to scale, HeartbeatService is already the natural extraction point — the IBrokerAdapter port and repository interfaces are already the seam you'd split along.

**"Why not event-driven?"**
> The heartbeat is time-driven, not event-triggered. Promise.allSettled already gives the parallelism needed. Adding a message broker would introduce failure modes without adding value for this scope.

**"Why Ports & Adapters and not plain layered architecture?"**
> Plain layered doesn't define what to do at external system boundaries. HeartbeatService would import AlpacaAdapter directly — swapping brokers means changing the service. With the port, the service never knows Alpaca exists.
