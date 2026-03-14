# VanTrade SRS Implementation Status

Date: 2026-03-14
Reference: `docs/SRS.md`

## MVP Feature Status

| SRS Item | Status | Notes |
|---|---|---|
| Auth (register/login/JWT) | ✅ Complete | API + web login/register flows implemented. |
| RBAC enforcement | ✅ Complete | Guards/decorators present on protected API controllers. |
| Blueprint CRUD (provider) | ✅ Complete | API endpoints + provider page implemented (`/my-blueprints`) for create/update/delete own blueprints. |
| Blueprint verification (admin) | ✅ Complete | API endpoint exists; admin page now uses authenticated admin endpoint. |
| Marketplace browse + detail | ✅ Complete | Listing/detail pages implemented. |
| API key encrypted storage | ✅ Complete | Backend encryption implemented; tester web page added (`/api-keys`). |
| Subscription create/list/toggle/delete | ✅ Complete | API endpoints + web pages/actions implemented. |
| Heartbeat processing with adapter | ✅ Complete | Runs every 60s and uses broker adapter injection. |
| Append-only trade logging | ✅ Complete | Insert-only behavior with HOLD logging; tester sees recent logs in subscriptions UI. |

## Functional Requirement Status

| FR | Status | Notes |
|---|---|---|
| FR-1 Authentication | ✅ | Implemented. |
| FR-2 Authorization (RBAC) | ✅ | Implemented in API. |
| FR-3 Blueprint Management | ✅ | Provider CRUD UI and API are both implemented. |
| FR-4 Admin Verification | ✅ | Implemented. |
| FR-5 API Key Vault | ✅ | Implemented end-to-end with new tester page. |
| FR-6 Subscription Management | ✅ | Implemented end-to-end. |
| FR-7 Heartbeat Execution | ✅ | Implemented with error isolation. |
| FR-8 Trade Logging | ✅ | Logging implemented and recent outcomes visible in subscription cards. |
| FR-9 Validation and Contracts | ✅ | API request validation + web response parsing now enforced with shared Zod schemas. |

## Newly Implemented in this pass

1. API auth now issues JWT in secure HttpOnly cookie (`vantrade_auth`) on register/login.
2. API now supports explicit logout endpoint that clears auth cookie.
3. JWT strategy now authenticates via bearer token **or** auth cookie.
4. Web API requests now always send credentials (`credentials: 'include'`).
5. Web auth pages no longer persist JWT in localStorage.
6. Navbar logout now calls API logout endpoint for server-side cookie invalidation.

## Next Priority Implementation Items

1. **Auth Session UX Hardening (optional MVP+)**
   - Add `/auth/me` endpoint + startup session hydration to avoid relying on localStorage `user` for role-aware navbar state.

## Suggested Order (Next Sprint)

1. Session hydration (`/auth/me`) and user state provider
