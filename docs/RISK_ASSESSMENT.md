# VanTrade — Risk Assessment

## Methodology

Each cell is scored **1–9** (1 = low risk, 9 = high risk) based on the likelihood and impact of a failure in that component against each risk criterion.
Scores ≥ 7 are highlighted as **high risk** requiring active mitigation.
Column totals identify the riskiest components. Row totals identify the riskiest criteria overall.

---

## Standard Risk Assessment

| RISK CRITERIA | Auth / Registration | Blueprint Marketplace | Subscription Management | Heartbeat Execution | API Key Vault | TOTAL RISK |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Scalability | 2 | 2 | 3 | **9** | 1 | 17 |
| Availability | 3 | 2 | 3 | **8** | 2 | 18 |
| Performance | 4 | 2 | 2 | **8** | 1 | 17 |
| Security | **7** | 2 | 3 | 6 | **9** | 27 |
| Data Integrity | 2 | 6 | 4 | **8** | 3 | 23 |
| **TOTAL RISK** | **18** | **14** | **15** | **39** | **16** | **102** |

---

## Component Risk Breakdown

### Auth / Registration — Total: 18

| Criterion | Score | Rationale |
| --- | :---: | --- |
| Scalability | 2 | Stateless JWT — any API instance handles auth without shared state |
| Availability | 3 | Single DB dependency; a Postgres outage blocks all logins |
| Performance | 4 | bcrypt cost factor 12 is intentionally slow (~200–400ms per login); acceptable at low concurrency but degrades under burst login load |
| Security | **7** | 7-day non-revocable JWT; no refresh token rotation; role embedded in token persists if changed by admin; no rate-limiting on `/auth/login` (brute-force risk) |
| Data Integrity | 2 | Email uniqueness enforced at DB level; password hashing is correct |

**Key mitigations needed:** Short-lived access tokens + refresh token rotation; rate-limit login endpoint.

---

### Blueprint Marketplace — Total: 14

| Criterion | Score | Rationale |
| --- | :---: | --- |
| Scalability | 2 | Read-heavy, results are cacheable; Postgres handles this easily |
| Availability | 2 | Non-critical path; a brief outage prevents browsing but doesn't stop active trading |
| Performance | 2 | Simple indexed queries; no complex joins |
| Security | 2 | Public read endpoint is safe; write endpoints are RBAC-guarded |
| Data Integrity | 6 | `parameters` is an untyped JSON column — schema drift between Blueprint versions silently causes heartbeat skips; no strategy versioning; no audit trail on verification actions |

**Key mitigations needed:** Add `strategyType` column; validate parameters schema at creation time, not just at execution time.

---

### Subscription Management — Total: 15

| Criterion | Score | Rationale |
| --- | :---: | --- |
| Scalability | 3 | `findAllActive()` is called every heartbeat tick; a full-table scan with deep includes grows linearly with subscription count |
| Availability | 3 | An outage here pauses trading for all users |
| Performance | 2 | Queries are indexed; acceptable at current scale |
| Security | 3 | Ownership checks enforced in service layer; `@@unique([userId, blueprintId])` prevents duplicate subscriptions at DB level |
| Data Integrity | 4 | No soft-delete; deleting a subscription hard-deletes its trade log history |

**Key mitigations needed:** Add pagination or cursor-based batching to `findAllActive()` for scale; use soft-delete on subscriptions to preserve trade history.

---

### Heartbeat Execution — Total: 39 ⚠️ Highest Risk

| Criterion | Score | Rationale |
| --- | :---: | --- |
| Scalability | **9** | Single-process `@Cron` — cannot run on multiple API instances without placing duplicate orders; all subscriptions processed in one 60s window regardless of count |
| Availability | **8** | If the NestJS process crashes, trading stops silently — no external watchdog, no alerting, no dead-letter queue for missed ticks |
| Performance | **8** | N concurrent outbound Alpaca HTTP calls per tick; with large N, event-loop saturation and Alpaca rate-limit errors are near-certain |
| Security | 6 | Decrypted `BrokerCredentials` live in-memory during execution; a heap dump would expose them; no credential lifetime bound shorter than the tick |
| Data Integrity | **8** | PnL is always stored as `null` — no position tracking, no realized PnL calculation; trade logs reflect signal decisions but not whether orders were actually filled at the recorded price |

**Key mitigations needed:**
- Replace cron with **BullMQ** queue (Redis-backed) for horizontal scaling, retries, and dead-letter handling
- Add external heartbeat monitoring (e.g., Cronitor, Better Uptime)
- Implement position tracking to enable realized PnL calculation

---

### API Key Vault — Total: 16

| Criterion | Score | Rationale |
| --- | :---: | --- |
| Scalability | 1 | Read-rarely; keys are fetched once per subscription per tick |
| Availability | 2 | Keys are stored in Postgres — same availability profile as the rest of the DB |
| Performance | 1 | AES-256-GCM decryption is negligible cost |
| Security | **9** | Highest-value attack target on the platform — stores user brokerage credentials; hardcoded `scryptSync` salt weakens key derivation; no key rotation mechanism; compromise of `ENCRYPTION_KEY` env var exposes all stored secrets simultaneously |
| Data Integrity | 3 | One key record per user (enforced `@unique`); correct — no duplicates possible |

**Key mitigations needed:**
- Migrate `ENCRYPTION_KEY` to a managed secrets vault (AWS KMS / HashiCorp Vault) with rotation policies
- Use a random per-record salt for key derivation instead of a hardcoded global salt
- Implement key version tracking to support re-encryption on rotation

---

## Risk Criteria Analysis

This section explains each criterion as a characteristic — what it measures, why it matters for VanTrade specifically, and what the score distribution across components reveals.

---

### Scalability — Row Total: 17

**What it measures:** How well a component handles growing load — more users, more subscriptions, more requests — without degrading or requiring architectural changes.

**Why it matters for VanTrade:** The platform's core promise is that *every active subscription executes every 60 seconds*. As subscription count grows, the execution engine must keep pace. A component that works fine at 10 subscriptions may completely break at 1,000.

**Score distribution:**

| Component | Score | Why |
| --- | :---: | --- |
| Auth / Registration | 2 | Stateless JWT — any number of API instances can handle auth independently; no shared session state |
| Blueprint Marketplace | 2 | Read-heavy CRUD on a small, stable dataset; easily cacheable with Redis or CDN |
| Subscription Management | 3 | `findAllActive()` runs every 60 seconds with full `include` of user + blueprint; grows linearly with subscription count |
| Heartbeat Execution | **9** | Hard ceiling: single-process `@Cron` cannot be distributed. Two instances = duplicate trades. All N subscriptions must complete within 60 seconds on one Node.js event loop |
| API Key Vault | 1 | Read-once per subscription per tick; negligible load even at large scale |

**Key insight:** Scalability risk is almost entirely concentrated in the Heartbeat. Every other component scales horizontally with standard techniques. The Heartbeat requires an architectural change (BullMQ / distributed queue) — not just more servers.

---

### Availability — Row Total: 18

**What it measures:** The probability that a component is reachable and functioning when needed. For a trading platform, availability failures have direct financial consequences — missed signals mean missed trades.

**Why it matters for VanTrade:** Unlike a content platform where downtime is inconvenient, VanTrade's downtime means user strategies stop executing silently. There is no compensation mechanism, no retry for missed ticks, and currently no alerting when this happens.

**Score distribution:**

| Component | Score | Why |
| --- | :---: | --- |
| Auth / Registration | 3 | Depends on Postgres; a DB outage blocks logins but does not stop currently-authenticated users from trading |
| Blueprint Marketplace | 2 | Non-critical path — browsing blueprints can be unavailable without stopping the execution engine |
| Subscription Management | 3 | If subscription queries fail, the heartbeat fetches zero active subscriptions and quietly executes nothing |
| Heartbeat Execution | **8** | Single point of failure with no watchdog. Process crash = silent halt. No dead-letter queue for missed ticks. No external monitoring to alert on-call |
| API Key Vault | 2 | Keys are in Postgres — same availability as the DB; no separate failure mode |

**Key insight:** Four of the five components share a single availability dependency: Postgres. The Heartbeat adds a second single point of failure at the application layer — and it's the only one that fails silently with no user-visible indication.

---

### Performance — Row Total: 17

**What it measures:** Whether a component completes its work within acceptable time bounds under realistic load — both latency for interactive requests and throughput for batch operations.

**Why it matters for VanTrade:** The heartbeat has a hard 60-second window. If processing 500 subscriptions takes 90 seconds, tick N is still running when tick N+1 fires. `@nestjs/schedule` will queue the second tick, causing them to pile up until the process runs out of memory or all ticks are serialized into a single thread.

**Score distribution:**

| Component | Score | Why |
| --- | :---: | --- |
| Auth / Registration | 4 | bcrypt at cost factor 12 takes ~200–400ms per login — intentional by design (slows brute force), but creates noticeable latency under concurrent login bursts |
| Blueprint Marketplace | 2 | Simple `findMany` queries on indexed columns; sub-10ms at current data volumes |
| Subscription Management | 2 | Indexed queries; the `findAllActive()` deep include is the only concern and is addressed under Scalability |
| Heartbeat Execution | **8** | Every tick fires N outbound HTTP requests to Alpaca simultaneously. Each call adds network round-trip latency. At N=100 with ~200ms per call, the tick takes 200ms in the best case; at N=1000 with connection pool limits, it takes seconds and hits Alpaca rate limits |
| API Key Vault | 1 | AES-256-GCM decryption is microseconds; not a performance factor |

**Key insight:** Performance risk and Scalability risk in the Heartbeat are the same root cause — the synchronous fan-out of N HTTP calls inside one tick. Fixing scalability (BullMQ) also fixes performance by bounding concurrency per worker.

---

### Security — Row Total: 27 ⚠️ Highest Row Total

**What it measures:** The risk that a component can be exploited to gain unauthorized access, extract sensitive data, or cause unauthorized actions. For a financial platform, security failures are often regulatory and legal failures, not just technical ones.

**Why it matters for VanTrade:** The platform holds two categories of high-value secrets: user passwords and user brokerage API keys. Compromise of either category can result in unauthorized trades, financial loss, and loss of user trust.

**Score distribution:**

| Component | Score | Why |
| --- | :---: | --- |
| Auth / Registration | **7** | No refresh token rotation means stolen JWTs cannot be revoked for up to 7 days; role changes don't propagate until token expiry; no rate limiting on login enables brute-force attacks |
| Blueprint Marketplace | 2 | Lowest-sensitivity data on the platform — blueprint descriptions and parameters are not secret |
| Subscription Management | 3 | Ownership enforced server-side; DB-level uniqueness constraint prevents injection-style duplicate subscriptions |
| Heartbeat Execution | 6 | Decrypted `BrokerCredentials` exist in process memory for the duration of each tick; a heap dump, memory inspection, or verbose logger would expose them |
| API Key Vault | **9** | Stores every user's brokerage credentials; a single compromised `ENCRYPTION_KEY` environment variable decrypts all of them simultaneously; hardcoded scrypt salt reduces key derivation entropy; no key rotation path exists |

**Key insight:** Security risk is distributed across two separate attack surfaces — the Auth layer (token theft/brute force) and the Key Vault (credential mass-exposure). These require different mitigations: Auth needs token lifecycle improvements; the Vault needs infrastructure-level key management (KMS/Vault), not just code changes.

---

### Data Integrity — Row Total: 23

**What it measures:** Whether the data the system records accurately and completely reflects what actually happened — trades placed, prices filled, PnL earned or lost. For a trading platform, incorrect records are as harmful as no records.

**Why it matters for VanTrade:** Trade logs are the evidence layer — the record a Tester uses to evaluate whether a Blueprint is performing as expected. If those logs are incomplete or incorrect, the entire value proposition of the platform (observable strategy performance) is undermined.

**Score distribution:**

| Component | Score | Why |
| --- | :---: | --- |
| Auth / Registration | 2 | Email uniqueness and password hashing are correctly enforced; no integrity gaps |
| Blueprint Marketplace | 6 | `parameters` is stored as untyped JSON — if the schema changes, existing Blueprints silently fail at execution time without any DB-level error; no audit trail records who verified a Blueprint or when |
| Subscription Management | 4 | Hard-deleting a Subscription cascades to its TradeLog records — a user's complete execution history is permanently destroyed if they unsubscribe |
| Heartbeat Execution | **8** | PnL is always stored as `null` — `calculatePnL()` exists in the engine but is never called because the system has no concept of an open position to close against; trade logs record the signal decision, not necessarily the actual filled price or whether the order was rejected |
| API Key Vault | 3 | `@unique` on `userId` enforces one key record per user; the append-and-replace pattern is correct |

**Key insight:** Data integrity failures in this system are silent — nothing crashes, no error is thrown, but the recorded data is wrong or incomplete. A Tester looking at their dashboard sees `PnL: null` on every trade and has no way to know whether their strategy is profitable. This makes the platform's core output — strategy performance analytics — unreliable.

---

## Risk Heat Map

```
                    Auth    Blueprints  Subscriptions  Heartbeat  API Keys
                   ──────  ──────────  ─────────────  ─────────  ────────
Scalability          ░░        ░░           ▒▒           ████       ░
Availability         ▒▒        ░░           ▒▒           ███░       ░░
Performance          ▒▒        ░░           ░░           ███░       ░
Security             ███       ░░           ▒▒           ██░        ████
Data Integrity       ░░        ██░          ▒▒           ███░       ▒▒

  ░ = 1–2 (Low)   ▒ = 3–4 (Moderate)   █ = 5–6 (Elevated)   ██+ = 7–9 (High)
```

---

## Prioritized Mitigation Roadmap

| Priority | Component | Risk | Mitigation |
|---|---|---|---|
| P0 | Heartbeat | Scalability / Performance | Replace cron with BullMQ job queue |
| P0 | Heartbeat | Availability | Add external uptime monitoring + alerting |
| P1 | API Key Vault | Security | Managed secrets vault + key rotation |
| P1 | Auth | Security | Short-lived JWTs + refresh token rotation |
| P1 | Heartbeat | Data Integrity | Implement position tracking and PnL calculation |
| P2 | Auth | Security | Rate-limit `/auth/login` and `/auth/register` |
| P2 | Blueprint Marketplace | Data Integrity | Validate parameters at creation; add `strategyType` |
| P3 | Subscription Mgmt | Data Integrity | Soft-delete to preserve trade log history |
| P3 | API Key Vault | Security | Per-record random salt for key derivation |
