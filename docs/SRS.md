# Software Requirements Specification (SRS) — VanTrade

## 1. Document Control

- **Project:** VanTrade
- **Version:** 1.0 (MVP Baseline)
- **Date:** 2026-03-14
- **Status:** Active Working Specification

---

## 2. Purpose

This SRS defines the functional and non-functional requirements for VanTrade and serves as the implementation contract for the team.

It includes:
- MVP scope (what must be delivered first)
- User stories per role
- Acceptance criteria and constraints aligned with the current architecture

---

## 3. Product Overview

VanTrade is a multi-tenant algorithmic strategy marketplace where:
- **Providers** publish strategy blueprints,
- **Testers** subscribe and execute strategies using their own Alpaca paper accounts,
- **Admins** verify blueprints and monitor platform safety.

VanTrade is implemented as a monorepo:
- `apps/api` — NestJS backend (business logic)
- `apps/web` — Next.js frontend (UI only)
- `packages/types` — shared Zod schemas and TypeScript interfaces

---

## 4. Goals and Success Criteria

### 4.1 Business Goals
1. Enable safe strategy sharing and testing without user-managed infrastructure.
2. Enforce role-based boundaries for provider, tester, and admin workflows.
3. Maintain a verifiable, append-only trade execution history.

### 4.2 MVP Success Metrics
1. Users can register/login and access role-appropriate features.
2. Providers can CRUD their own blueprints.
3. Admins can verify/unverify blueprints.
4. Testers can subscribe/unsubscribe and manage active subscriptions.
5. Heartbeat executes active subscriptions and writes trade logs.
6. API keys are encrypted before persistence.

---

## 5. Scope

### 5.1 In Scope (MVP)
- JWT authentication and role-based authorization.
- Blueprint marketplace listing (verified only for public listing).
- Provider blueprint CRUD (own resources only).
- Admin verification workflow for blueprints.
- Tester subscription lifecycle (create/toggle/delete own subscriptions).
- Encrypted Alpaca API key storage (AES-256-GCM).
- Heartbeat job every 60 seconds to process active subscriptions.
- Trade logging (append-only).
- Basic dashboard pages for marketplace, subscriptions, and admin review.

### 5.2 Out of Scope (MVP)
- Live (real-money) trading.
- High-frequency trading workflows.
- ML/AI strategy generation or optimization.
- Advanced analytics (Sharpe, max drawdown, portfolio optimization).
- Social features (comments, ratings, messaging).

---

## 6. Users and Roles

1. **Provider**
   - Publishes and maintains strategy blueprints.
2. **Tester**
   - Connects Alpaca paper API keys and runs subscribed strategies.
3. **Admin**
   - Reviews and verifies platform-safe blueprints.

---

## 7. Assumptions and Dependencies

- PostgreSQL is available and reachable.
- Alpaca Paper Trading API is reachable.
- Environment variables are configured for API and web.
- Shared schema/types package remains the source of truth for contracts.

---

## 8. Functional Requirements (FR)

### FR-1 Authentication
- System shall allow public registration and login.
- System shall return JWT access token on successful auth.
- System shall identify user role on authenticated requests.

### FR-2 Authorization (RBAC)
- System shall enforce RBAC at API layer.
- Providers can only manage their own blueprints.
- Testers can only manage their own subscriptions and API keys.
- Admins can verify or revoke verification on blueprints.

### FR-3 Blueprint Management
- Provider shall create blueprint with validated parameters.
- Provider shall update/delete own blueprint.
- Public users shall view verified blueprints in marketplace.
- Users shall view individual blueprint details.

### FR-4 Admin Verification
- Admin shall list blueprints requiring review.
- Admin shall set blueprint verification status.

### FR-5 API Key Vault
- Tester shall store Alpaca API key/secret.
- System shall encrypt key and secret before DB persistence.
- System shall decrypt credentials only at execution time.

### FR-6 Subscription Management
- Tester shall subscribe to a blueprint.
- Tester shall list own subscriptions.
- Tester shall pause/resume own subscriptions.
- Tester shall remove own subscriptions.

### FR-7 Heartbeat Execution
- System shall run heartbeat every 60 seconds.
- System shall process all active subscriptions.
- System shall isolate failures per subscription (continue on error).
- System shall place orders through broker adapter abstraction.

### FR-8 Trade Logging
- System shall create a trade log record for execution outcomes.
- Trade logs shall be append-only (no update/delete operations).

### FR-9 Validation and Contracts
- API request payloads shall be validated with shared Zod schemas.
- Frontend API responses shall be validated/typed via shared contracts.

---

## 9. Non-Functional Requirements (NFR)

### NFR-1 Security
- Secrets must not be hardcoded.
- API keys must be encrypted at rest using AES-256-GCM.
- Protected endpoints must require JWT.
- RBAC must be enforced server-side.

### NFR-2 Reliability
- Heartbeat must continue processing remaining subscriptions if one fails.
- The system must gracefully handle external API failures.

### NFR-3 Maintainability
- API controllers must remain thin (validate + delegate only).
- Prisma access only through repository files.
- Trading calculations should remain pure and testable.

### NFR-4 Performance
- Heartbeat cycle target: complete one pass per minute for MVP-scale load.
- UI pages should remain responsive and avoid blocking execution workflows.

### NFR-5 Quality
- TypeScript strict mode enabled across apps.
- Minimum 80% line coverage target for `apps/api/src/trading/`.

---

## 10. MVP Definition

### 10.1 MVP Feature Set (Must Have)
1. Auth (register/login/JWT)
2. RBAC enforcement
3. Blueprint CRUD (provider)
4. Blueprint verification (admin)
5. Marketplace browse + blueprint detail
6. API key encrypted storage
7. Subscription create/list/toggle/delete (tester)
8. Heartbeat processing with broker adapter
9. Append-only trade logging

### 10.2 MVP Done Criteria
- All Must-Have features implemented and testable end-to-end in local environment.
- No critical security violations of architecture rules.
- Key flows validated:
  - Provider can publish blueprint
  - Admin can verify blueprint
  - Tester can subscribe and see subscription state changes
  - Heartbeat can process and log execution outcomes

---

## 11. User Stories (MVP)

### 11.1 Provider Stories

### US-P1 — Create Blueprint
**As a** Provider, **I want** to create a strategy blueprint, **so that** testers can evaluate my logic.

**Acceptance Criteria**
- Provider can submit title, description, and validated parameters.
- Blueprint is stored with author ownership.
- Non-provider users cannot access create endpoint.

### US-P2 — Edit Own Blueprint
**As a** Provider, **I want** to update my own blueprint, **so that** I can improve strategy parameters.

**Acceptance Criteria**
- Provider can update only their own blueprint.
- Validation errors are returned for invalid fields.
- Other providers cannot edit this blueprint.

### US-P3 — Delete Own Blueprint
**As a** Provider, **I want** to delete my own blueprint, **so that** I can remove obsolete strategies.

**Acceptance Criteria**
- Provider can delete only own blueprint.
- Unauthorized delete attempts are blocked.

### 11.2 Tester Stories

### US-T1 — Register/Login
**As a** Tester, **I want** to register and login, **so that** I can access subscription features.

**Acceptance Criteria**
- Valid registration creates a tester account.
- Valid login returns JWT and role information.

### US-T2 — Subscribe to Blueprint
**As a** Tester, **I want** to subscribe to a verified blueprint, **so that** I can run it on my account.

**Acceptance Criteria**
- Authenticated tester can create subscription.
- Unauthenticated user is redirected/blocked until login.
- Non-tester roles are denied by API RBAC.

### US-T3 — Manage Subscriptions
**As a** Tester, **I want** to pause/resume and remove subscriptions, **so that** I control execution.

**Acceptance Criteria**
- Tester can view only own subscriptions.
- Toggle updates active state.
- Remove deletes only own subscription.

### US-T4 — Store Broker API Keys
**As a** Tester, **I want** to store API credentials securely, **so that** the heartbeat can place orders.

**Acceptance Criteria**
- Keys are encrypted before DB write.
- Plaintext credentials are never persisted.

### 11.3 Admin Stories

### US-A1 — Review Blueprints
**As an** Admin, **I want** to list blueprints for review, **so that** I can moderate marketplace quality.

**Acceptance Criteria**
- Admin can see blueprint review list.
- Non-admin users are denied this access.

### US-A2 — Verify/Reject Blueprint
**As an** Admin, **I want** to verify or revoke verification for blueprints, **so that** only approved strategies are public.

**Acceptance Criteria**
- Admin can set `isVerified` true/false.
- Marketplace listing reflects verification state.

### 11.4 System Stories

### US-S1 — Heartbeat Executes Active Subscriptions
**As the** Platform, **I want** to process active subscriptions every 60 seconds, **so that** trades are automated.

**Acceptance Criteria**
- Scheduler runs every 60 seconds.
- Each active subscription is processed.
- Failure on one subscription does not stop others.

### US-S2 — Persist Trade Logs
**As the** Platform, **I want** to write immutable trade logs, **so that** users can audit outcomes.

**Acceptance Criteria**
- New trade log entries are inserted for execution outcomes.
- No API supports update/delete on trade logs.

---

## 12. Constraints and Compliance Rules

1. No Prisma imports outside repository files in API.
2. No Alpaca SDK imports outside Alpaca adapter.
3. No business logic in web app route layer; web remains UI + API client.
4. No `any` in TypeScript.
5. No client-side trust for RBAC decisions.

---

## 13. Risks and Mitigations (MVP)

1. **Risk:** Invalid blueprint parameter shape at runtime.
   - **Mitigation:** Validate with shared Zod schemas at boundaries.
2. **Risk:** External broker/API outages.
   - **Mitigation:** Heartbeat error isolation + retry in future iteration.
3. **Risk:** Credential leakage.
   - **Mitigation:** Encrypt at rest + environment-managed secrets.

---

## 14. Future Enhancements (Post-MVP)

- Provider analytics dashboards (PnL aggregates, risk metrics).
- Notifications (execution failures, subscription status).
- Rich audit dashboard with filtering and exports.
- Multi-broker adapters beyond Alpaca.

---

## 15. Traceability (MVP Summary)

- **Auth + RBAC:** FR-1, FR-2 → US-T1, US-T2, US-A1, US-A2
- **Blueprint Lifecycle:** FR-3, FR-4 → US-P1, US-P2, US-P3, US-A1, US-A2
- **Execution + Logging:** FR-6, FR-7, FR-8 → US-T3, US-S1, US-S2
- **Security + Validation:** FR-5, FR-9, NFR-1 → US-T4

---

## 16. Approval

This document is the baseline requirements reference for VanTrade MVP implementation. Any requirement changes must be logged as versioned updates to this file.
