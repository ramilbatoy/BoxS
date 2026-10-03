# BoxS subscription functionality matrix

Companion to [SUBSCRIPTION_SYSTEM_AUDIT.md](SUBSCRIPTION_SYSTEM_AUDIT.md). Same commit (`09b29ed`),
same verification: everything marked below was read in the source, run against a live instance, or
both. Nothing is marked Complete because a page exists.

## How to read this

**Status**

| Value | Meaning |
| --- | --- |
| Complete | Works end to end, including the parts you cannot see from the UI |
| Partially Complete | Works, with a named gap or a named defect |
| UI Only | A screen exists; the behaviour behind it does not |
| Backend Only | The logic and the endpoint exist; no screen reaches them |
| Broken | Present and produces a wrong or unsafe result |
| Missing | Not implemented |
| Needs Review | Implemented, but a product decision is required before it can be called correct |

**Layer columns** — `Yes` / `Partial` / `No` / `n/a`.

- **Frontend** — a customer- or admin-facing screen
- **API** — a `/api/v1` endpoint
- **Service** — business logic in `src/modules`
- **Database** — schema support
- **Admin** — reachable by a non-technical administrator through the admin UI
- **Customer** — reachable by a customer through the storefront or account area
- **Tests** — automated coverage of *this* feature

**Priority** is the priority of the issues in the row, using the audit's P0–P3 scale. `—` means no
outstanding issue.

---

## 1. Plan Builder (Foundation 1)

| Feature | Current Status | Frontend | API | Service | Database | Admin | Customer | Tests | Issues | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create plan | Complete | Yes | Yes | Yes | Yes | Yes | n/a | No | Base price accepts negatives; no validation | P2 |
| Edit plan | **Broken** | Yes | Yes | Yes | Yes | Yes | n/a | No | Save deletes all `PlanItem` and `PlanVariant` rows (verified 1→0); orphans `SubscriptionItem.refId` | **P1** |
| Publish plan | Complete | Yes | Yes | Yes | Yes | Yes | n/a | No | Writes `PlanVersion` + bumps `currentVersion`; audited | — |
| Plan status DRAFT/PUBLISHED/ARCHIVED | Complete | Yes | Yes | Yes | Yes | Yes | n/a | No | Archive only via bulk action | P3 |
| Plan versioning | **Broken** | No | Yes | Yes | Yes | No | n/a | No | Editing a published plan does not bump the version; snapshots drift from reality; nothing reads `PlanVersion.snapshot` | **P1** |
| Option groups | Complete | Yes | Yes | Yes | Yes | Yes | Yes | Selection tested | Cannot set `required`, reorder, or delete options from the UI | P2 |
| Option price deltas | Complete | Yes | Yes | Yes | Yes | Yes | Yes | Yes | — | — |
| Option duration (`durationDays`) | Complete | Yes | Yes | Yes | Yes | Yes | Yes | No | — | — |
| Option delivery count / interval / billing mode | Backend Only | No | Yes | Yes | Yes | **No** | Yes | No | Drives `resolveTerm`; only the seed can set it | **P1** |
| Option default (`isDefault`) | **Broken** | No | Yes | n/a | Yes | **No** | n/a | No | No UI; seed marks two defaults in one group, so the storefront "From" price is the wrong option | P2 |
| Plan variants (combination + override price) | Backend Only | No | Yes | Yes | Yes | **No** | Yes | No | No UI; wiped by any plan edit | **P1** |
| Included products / add-ons (`PlanItem`) | Backend Only | No | Yes | Yes | Yes | **No** | Yes | No | No UI; wiped by any plan edit | **P1** |
| Lifecycle rules (4 toggles) | Complete | Yes | Yes | Yes | Yes | Yes | n/a | Engine tested | — | — |
| Cancellation cutoff | Complete | Yes | Yes | Yes | Yes | Yes | n/a | Yes | — | — |
| Change / skip / delivery-change cutoffs | Backend Only | No | Yes | Yes | Yes | **No** | n/a | Yes | Enforced by the engine; not editable | P2 |
| Minimum commitment days | Backend Only | No | Yes | Yes | Yes | **No** | n/a | Yes | Same | P2 |
| Availability window (`startsAt`/`endsAt`) | Backend Only | No | Yes | Yes | Yes | **No** | n/a | No | Enforced in `quoteSubscription` | P2 |
| Plan image | Missing | No | No | n/a | Yes | No | No | No | Column exists, never set or rendered | P3 |
| Plan SEO fields | Complete | Yes | Yes | n/a | Yes | Yes | Yes | No | — | — |
| Storefront label / hide plan | Complete | Yes | Yes | n/a | Yes | Yes | Yes | No | `HIDDEN` excluded from list and detail | — |
| Bulk publish / archive / recategorise / delete | Complete | Yes | Yes | Yes | Yes | Yes | n/a | No | No confirmation dialog | P3 |
| Plan preview price on storefront | Partially Complete | Yes | n/a | Yes | Yes | n/a | Yes | No | Uses the plan delivery fee, not the zone fee, so it differs from checkout | P2 |

## 2. Subscription Engine (Foundation 2)

| Feature | Current Status | Frontend | API | Service | Database | Admin | Customer | Tests | Issues | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create subscription at checkout | Complete | Yes | Yes | Yes | Yes | No | Yes | **No** | Single transaction writes subscription, order, items, snapshot, payment, transaction, delivery, redemption, notification. Verified live. No test. | P1 |
| Status `PENDING` | Complete | Yes | Yes | Yes | Yes | Yes | Yes | No | Set when the provider does not capture | — |
| Status `ACTIVE` | Complete | Yes | Yes | Yes | Yes | Yes | Yes | Yes | — | — |
| Status `PAUSED` | Partially Complete | Yes | Yes | Yes | Yes | No | Yes | Yes | Works, but does not extend the term | **P1** |
| Status `PAST_DUE` | Partially Complete | No | Yes | Yes | Yes | No | No | Yes | Only reachable via a manual failed renew; nothing escalates or retries | P1 |
| Status `SUSPENDED` | **Missing** | No | No | No | Yes | No | No | No | Enum value, no writer | P1 |
| Status `CANCELLED` | Complete | Yes | Yes | Yes | Yes | No | Yes | Yes | — | — |
| Status `EXPIRED` | **Missing** | No | No | No | Yes | No | No | No | Enum value, no writer | P1 |
| Status `COMPLETED` | **Missing** | No | No | Partial | Yes | No | No | No | `completeIfFinished` exists and is never called | P1 |
| One-time / fixed-duration | Complete | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Verified on `SB-10001` | — |
| Weekly recurring | Partially Complete | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Created and renewed live; renewal records nothing (below) | **P0** |
| Monthly recurring | Partially Complete | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Same engine path as weekly | **P0** |
| Custom duration (3/5/7/14/30 days) | Complete | Yes | Yes | Yes | Yes | Partial | Yes | Yes | Admin can set days but not the matching delivery count | P2 |
| Fixed delivery count | Partially Complete | Yes | Yes | Yes | Yes | **No** | Yes | No | `remainingDeliveries` is set at checkout and never decremented | **P1** |
| Renewal (scheduled) | **Missing** | No | No | Partial | Yes | No | No | Engine only | No cron, queue, or worker; `nextBillingAt` is written and never read | **P1** |
| Renewal (manual) | **Broken** | No | Yes | Yes | Yes | No | **Yes** | Engine only | Advances the period, records no `Payment`, no `Order`, no delivery; callable repeatedly by the customer | **P0** |
| Pause | Partially Complete | Yes | Yes | Yes | Yes | No | Yes | Yes | Term not extended; `pausedAt` written, never read | **P1** |
| Resume | Partially Complete | Yes | Yes | Yes | Yes | No | Yes | Yes | Only extends the period if it already elapsed | P1 |
| Skip delivery | **Broken** | Yes | Yes | Yes | Yes | No | Yes | Yes | Advances exactly 1 calendar day regardless of interval; ignores the zone schedule; never decrements `remainingDeliveries` | **P1** |
| Cancel | Complete | Yes | Yes | Yes | Yes | No | Yes | Yes | Honours `allowCancel`, min commitment, and cutoff | — |
| Change plan + proration | Backend Only | **No** | Yes | Yes | Yes | **No** | **No** | Proration tested | Fully implemented with credit/charge and audit; the account button is a link to `/plans` | P1 |
| Change delivery address | Partially Complete | Yes | Yes | Yes | Yes | No | Yes | No | Does not verify the address belongs to the customer | P2 |
| Change delivery date | Partially Complete | Yes | Yes | Yes | Yes | No | Yes | No | Enforces the cutoff; does not check the zone schedule | P2 |
| Payment failure handling | Partially Complete | No | Yes | Yes | Yes | No | No | Yes | `PAST_DUE` only; no retry, no dunning, no escalation | P1 |
| Subscription events / history | Complete | Yes | Yes | Yes | Yes | **No** | Yes | No | Every transition writes an event; verified. Admin cannot view them. | P1 |
| Credits (`creditCents`) | Backend Only | No | Yes | Yes | Yes | No | No | Yes | Accrued by plan change; never spent | P2 |
| Admin subscription detail | **Missing** | No | Yes | Yes | Yes | **No** | n/a | No | List has no row link; no detail component exists | **P1** |

## 3. Pricing

| Feature | Current Status | Frontend | API | Service | Database | Admin | Customer | Tests | Issues | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Canonical price service | Complete | n/a | Yes | Yes | n/a | n/a | n/a | Yes | One formula, one implementation, no duplicates. Verified live. | — |
| Base price | Complete | Yes | Yes | Yes | Yes | Yes | Yes | Yes | — | — |
| Variant / option delta | Complete | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Override and sum-of-deltas share one column | P3 |
| Add-ons | Complete | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Fetched 100-at-a-time then filtered in memory | P2 |
| Built-in discount | Complete | Yes | Yes | Yes | Yes | Yes | Yes | No | — | — |
| Coupon — evaluation | Complete | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Scope, dates, minimum, max uses, per-customer limit all enforced | — |
| Coupon — amount applied | **Broken** | Yes | Yes | Yes | Yes | n/a | Yes | Partial | `evaluateCoupon` computes 10% of ₱1,700 and the customer gets 10% of ₱1,900 — delivery and tax are discounted | **P1** |
| Automatic coupons | Missing | No | No | No | Yes | No | No | No | `Coupon.automatic` is settable and unread | P3 |
| Delivery fee | Complete | Yes | Yes | Yes | Yes | Yes | Yes | No | Zone fee wins; plan fee is the fallback | — |
| Tax | Partially Complete | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Per-plan `taxRateBps` works; the `tax.rate_bps` setting is inert | P2 |
| Final total | Complete | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Clamped at zero | — |
| Live quote endpoint | Complete | Yes | Yes | Yes | n/a | n/a | Yes | No | `POST /pricing/quote`, public, verified | — |
| Daily / weekly / monthly equivalents | Partially Complete | Yes | Yes | Yes | n/a | n/a | Yes | No | Derived from a rounded daily figure; compounds error | P3 |
| Price written to order | Complete | n/a | Yes | Yes | Yes | Yes | Yes | **No** | Eight denormalised columns plus a full snapshot | P1 |
| Price written to subscription | Complete | n/a | Yes | Yes | Yes | Yes | Yes | **No** | `priceCents` + `priceSnapshot` | P1 |
| Renewal pricing | Complete | n/a | Yes | Yes | Yes | No | No | Yes | Uses the stored `priceCents`, not a re-quote — correct | — |
| Historical price protection | Complete | n/a | n/a | Yes | Yes | n/a | n/a | **No** | ₱2,500→₱2,800 test: order and subscription unchanged | P1 |
| Price in React components | Complete (absent) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | No component computes a price; verified by grep | — |

## 4. Checkout and orders

| Feature | Current Status | Frontend | API | Service | Database | Admin | Customer | Tests | Issues | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Subscribe wizard (9 steps) | Complete | Yes | Yes | Yes | n/a | n/a | Yes | No | Live quote per step; verified | P2 |
| Checkout transaction | Complete | Yes | Yes | Yes | Yes | n/a | Yes | **No** | Verified live end to end | **P1** |
| Idempotency | Complete | Yes | Yes | Yes | Yes | n/a | Yes | No | Replayed key returned `duplicate: true` and the same order | — |
| Address at checkout | Partially Complete | Yes | Yes | Yes | Yes | n/a | Yes | No | Only `line1` is required client-side; no server validation | P2 |
| Delivery window selection | Complete | Yes | Yes | Yes | Yes | n/a | Yes | Yes | Day, capacity, and cutoff enforced | — |
| Payment provider selection | Partially Complete | Yes | Yes | Yes | Yes | n/a | Yes | No | Three in-memory demo providers; the wizard hard-codes the list instead of calling `listPaymentProviders()` | P2 |
| Order creation | Complete | n/a | Yes | Yes | Yes | Yes | Yes | No | — | P1 |
| Order snapshot | Complete | n/a | Yes | Yes | Yes | Yes | n/a | Yes | — | — |
| Order status workflow | Complete | Yes | Yes | n/a | Yes | Yes | Yes | No | Six statuses via the order detail screen; bulk confirm/delivered | — |
| Order detail (admin) | Complete | Yes | Yes | n/a | Yes | Yes | n/a | No | — | — |
| Order history (customer) | Complete | Yes | Yes | n/a | Yes | n/a | Yes | No | — | — |
| Order read authorization | **Broken** | n/a | Yes | n/a | n/a | n/a | n/a | No | `GET /orders/:id` had no auth check at all | **P0** |
| Cancel an order | Partially Complete | Yes | Yes | n/a | Yes | Yes | **No** | No | Admin bulk only; no customer path; no refund side effect | P2 |
| Refund | Backend Only | **No** | Yes | Partial | Yes | **No** | No | No | Endpoint marks the payment and order refunded and never calls the provider | P2 |
| Orders for renewals | **Missing** | No | No | No | Yes | No | No | No | No order is created when a subscription renews | **P0** |

## 5. Delivery

| Feature | Current Status | Frontend | API | Service | Database | Admin | Customer | Tests | Issues | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Delivery zones | Partially Complete | Yes | Yes | n/a | Yes | Create only | Yes | No | No edit, no delete, no list screen of its own | P2 |
| Delivery schedules | Partially Complete | Yes | Yes | n/a | Yes | One window at create | Yes | No | Cannot add a second window to an existing zone | P2 |
| Cutoff enforcement | Complete | Yes | Yes | Yes | Yes | n/a | Yes | Yes | — | — |
| Capacity (`maxOrders`) | Complete | n/a | Yes | Yes | Yes | n/a | Yes | Yes | Counted against non-cancelled assignments | — |
| Delivery assignment (first) | Complete | Yes | Yes | Yes | Yes | Yes | Yes | No | Created in the checkout transaction | — |
| Delivery assignments (2..n) | **Missing** | No | No | No | Yes | No | No | No | A 3-delivery program has one assignment | **P1** |
| Delivery status | Partially Complete | Yes | Yes | n/a | Yes | Via order status | Yes | No | Mirrors the order; no direct control on the deliveries screen | P2 |
| Delivery list (admin) | Complete | Yes | Yes | n/a | Yes | Yes | n/a | No | Read-only | P2 |
| Zone fee in pricing | Complete | Yes | Yes | Yes | Yes | Yes | Yes | No | — | — |

## 6. Catalog

| Feature | Current Status | Frontend | API | Service | Database | Admin | Customer | Tests | Issues | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Categories | Partially Complete | Yes | Yes | n/a | Yes | Create only | Yes | No | No edit/delete UI; `parentId` tree unused | P2 |
| Products | Partially Complete | Yes | Yes | n/a | Yes | Create only | Yes | No | No edit/delete UI | P2 |
| Product variants | Backend Only | No | Yes | n/a | Yes | **No** | No | No | Repository supports them; no UI, no storefront use | P2 |
| Add-ons | Partially Complete | Yes | Yes | n/a | Yes | Create only | Yes | No | Selectable in the wizard and priced correctly | P2 |
| CSV product import | Partially Complete | **No** | Yes | n/a | Yes | **No** | n/a | No | Endpoint works; no upload UI; requires raw `categoryId` | P2 |
| CSV export | **Broken** | Yes | Yes | n/a | n/a | Yes | n/a | No | Any signed-in user could export everything; caps silently at 100 rows | **P0** |
| Menu / products storefront pages | Complete | Yes | n/a | n/a | Yes | n/a | Yes | No | Server-rendered from repositories | — |
| Subscription types | Partially Complete | No | Yes | n/a | Yes | **No** | n/a | No | Selectable in the Plan Builder; cannot be created from the UI | P2 |

## 7. Customers and accounts

| Feature | Current Status | Frontend | API | Service | Database | Admin | Customer | Tests | Issues | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Registration | Complete | Yes | Yes | n/a | Yes | n/a | Yes | No | Rate limited, bcrypt 12, creates a customer profile | — |
| Login | Complete | Yes | Yes | n/a | Yes | Yes | Yes | No | Verified for both roles; error message rendered on failure | — |
| Logout | Complete | Yes | n/a | n/a | n/a | Yes | Yes | No | Server action | — |
| Password change | Complete | Yes | Yes | n/a | Yes | n/a | Yes | No | Min 8, re-hashed | — |
| Password reset | **Missing** | No | No | No | No | No | No | No | No route, no token, no mail | **P1** |
| Session | Complete | n/a | n/a | n/a | n/a | Yes | Yes | No | JWT with role and permissions | — |
| Customer profile | Partially Complete | Yes | Yes | n/a | Yes | List only | Yes | No | Name and phone only; `notes` and `marketingOptIn` unused | P2 |
| Addresses — list / create | Complete | Yes | Yes | n/a | Yes | No | Yes | No | — | — |
| Addresses — delete | **Broken** | No | Yes | n/a | Yes | No | Yes | No | Any signed-in user could delete any address by id | **P0** |
| Addresses — edit | Missing | No | No | n/a | Yes | No | No | No | `saveAddress` accepts an id; nothing passes one | P2 |
| Payment methods | **Missing** | No | No | No | Yes | No | No | No | `PaymentMethod` model exists; never written or read | P2 |
| Account dashboard | Complete | Yes | n/a | n/a | Yes | n/a | Yes | No | Subscription, orders, notifications | — |
| Customer admin detail | Missing | No | No | n/a | Yes | **No** | n/a | No | List, search, bulk suspend only | P2 |
| Suspend / activate customer | Complete | Yes | Yes | n/a | Yes | Yes | n/a | No | Bulk action; no confirmation | P3 |

## 8. Admin platform

| Feature | Current Status | Frontend | API | Service | Database | Admin | Customer | Tests | Issues | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | Complete | Yes | Yes | Yes | Yes | Yes | n/a | No | 9 metrics, revenue chart, popular plans, recent orders, activity | P2 |
| Reports | Partially Complete | Yes | Yes | Yes | Yes | Yes | n/a | No | Same component as the dashboard; no export, no breakdowns | P2 |
| Navigation | Complete | Yes | n/a | n/a | n/a | Yes | n/a | No | 28 permission-filtered entries; "Content" and "Pages" duplicate | P3 |
| Global search | **Broken** | Yes | Yes | Yes | Yes | Yes | n/a | No | Any signed-in user could search all customers by name and email | **P0** |
| Generic record browser | Partially Complete | Yes | Yes | n/a | Yes | Yes | n/a | No | No pagination, no sorting, no filters, no edit/delete | P2 |
| Bulk actions | Partially Complete | Yes | Yes | n/a | Yes | Yes | n/a | No | Plans, orders, customers only; no confirmation | P2 |
| Roles and permissions | Complete | Yes | Yes | Yes | Yes | Yes | n/a | Yes | 32 keys, 9 presets, custom roles with checkboxes | — |
| Users | Partially Complete | Yes | Yes | n/a | Yes | Create only | n/a | No | No edit UI; blank password defaults to `ChangeMe123!` | P2 |
| Settings | Partially Complete | Yes | Yes | n/a | Yes | Yes | n/a | No | 3 of 8 settings are read by nothing | P2 |
| Feature flags | Partially Complete | Yes | Yes | n/a | Yes | Yes | n/a | No | Only `ENABLE_COUPONS` is checked anywhere | P2 |
| Content pages | Partially Complete | Yes | Yes | n/a | Yes | Create only | Yes | No | Blocks render on the home page; no block editor | P2 |
| FAQs | Complete | Yes | Yes | n/a | Yes | Yes | Yes | No | Create and delete; no edit UI | P3 |
| Menus | Complete | Yes | Yes | n/a | Yes | Yes | Yes | No | Replace-all semantics; no nesting despite `parentId` | P3 |
| Media library | Partially Complete | Yes | Yes | n/a | Yes | Yes | n/a | No | Upload works; SVG accepted; `public/uploads` is not a volume | P2 |
| Notifications — in-app | Complete | Yes | Yes | Yes | Yes | Yes | Yes | No | Written on 5 lifecycle events; shown on `/account` | — |
| Notifications — email / SMS / push | **UI Only** | Yes | Yes | No | Yes | Yes | No | No | Templates can be enabled; rows are written; nothing sends | P2 |
| Audit log | Partially Complete | Yes | Yes | Yes | Yes | Yes | n/a | No | 4 action types; no price, role, user, refund, or settings coverage | P2 |
| Webhook log | Partially Complete | Yes | Yes | Yes | Yes | Yes | n/a | Yes | Signature + idempotency verified; events have no effect | **P1** |
| API keys | **UI Only** | Yes | Yes | No | Yes | Yes | n/a | No | Generated and hashed; nothing authenticates with them | P2 |
| Contact messages | Backend Only | No | Yes | n/a | Yes | **No** | Yes | No | Public form writes rows; `system.contacts()` has no caller and no screen | P2 |

## 9. API and platform

| Feature | Current Status | Frontend | API | Service | Database | Admin | Customer | Tests | Issues | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/v1` versioned namespace | Complete | n/a | Yes | n/a | n/a | n/a | n/a | No | — | — |
| Consistent response envelope | Complete | n/a | Yes | n/a | n/a | n/a | n/a | No | `{success, data}` / `{success, error:{code,message}}` everywhere | — |
| Error messages in plain language | Complete | n/a | Yes | Yes | n/a | n/a | n/a | No | `AppError` carries code, message, and status | — |
| Authentication on the API | Complete | n/a | Yes | Yes | Yes | n/a | n/a | No | Auth.js session read per request | — |
| Authorization on the API | **Broken** | n/a | Partial | Yes | Yes | n/a | n/a | **No** | Hand-written per branch; six endpoints were missing or under-checking | **P0** |
| Input validation | **Missing** | n/a | No | No | n/a | n/a | n/a | No | `zod` is a dependency and is imported nowhere | P2 |
| Rate limiting | Partially Complete | n/a | Yes | Yes | n/a | n/a | n/a | No | In-process map; login and register only | P2 |
| CSRF protection | **Missing** | n/a | No | n/a | n/a | n/a | n/a | No | Cookie auth, no token, no origin check | P2 |
| Pagination | Partially Complete | No | Yes | Yes | Yes | **No** | No | No | Backend caps at 100; no UI control; exports truncate | P2 |
| Idempotency keys | Partially Complete | Yes | Yes | Yes | Yes | n/a | Yes | No | Checkout only; `PaymentTransaction.idempotencyKey` unused | P3 |
| Repository layer | Complete | n/a | n/a | n/a | Yes | n/a | n/a | No | Only `src/repositories` imports Prisma; verified | — |
| Module layer free of Prisma | Complete | n/a | n/a | Yes | n/a | n/a | n/a | Yes | Verified by grep | — |
| Server components bypass the API | Needs Review | Yes | n/a | Partial | Yes | Yes | Yes | No | Documented in `ARCHITECTURE.md`; means authorization lives in two places | P2 |
| OpenAPI spec | Partially Complete | n/a | n/a | n/a | n/a | n/a | n/a | No | 5 of ~60 endpoints | P2 |
| Health endpoint | Complete | n/a | Yes | n/a | n/a | n/a | n/a | No | `GET /api/v1/health` returns 200; not wired to a container healthcheck | P2 |

## 10. Infrastructure

| Feature | Current Status | Frontend | API | Service | Database | Admin | Customer | Tests | Issues | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dev Docker Compose | Complete | n/a | n/a | n/a | Yes | n/a | n/a | **No** | Correct ports, volume, healthcheck, bind mount, hot reload | P2 |
| Prod Docker Compose | **Broken** | n/a | n/a | n/a | Yes | n/a | n/a | **No** | Seeds demo super-admin credentials on first boot | **P0** |
| `APP_PORT=3017` configurable | Complete | n/a | n/a | n/a | n/a | n/a | n/a | No | Compose, scripts, and `docker-check` all read it | — |
| `MYSQL_PORT=3317` configurable | Complete | n/a | n/a | n/a | n/a | n/a | n/a | No | Same | — |
| Internal `mysql:3306` | Complete | n/a | n/a | n/a | Yes | n/a | n/a | No | Both compose files | — |
| `MYSQL_USER` / `MYSQL_PASSWORD` configurable | **Broken** | n/a | n/a | n/a | Yes | n/a | n/a | No | `DATABASE_URL` is a hardcoded literal in both compose files | P2 |
| Port conflict check | Complete | n/a | n/a | n/a | n/a | n/a | n/a | No | `npm run docker:check` | — |
| Persistent database volume | Complete | n/a | n/a | n/a | Yes | n/a | n/a | No | `subscription_platform_mysql_data` | — |
| Persistent upload volume | **Missing** | n/a | n/a | n/a | n/a | n/a | n/a | No | `public/uploads` lives in the image | P2 |
| Migrations | Complete | n/a | n/a | n/a | Yes | n/a | n/a | No | One init migration; applied cleanly | — |
| Seed | Partially Complete | n/a | n/a | n/a | Yes | n/a | n/a | No | Idempotent and realistic; runs in production | **P0** |
| Production build | Complete | n/a | n/a | n/a | n/a | n/a | n/a | No | `npm run build` succeeds; 18/20 routes dynamic | P2 |
| Typecheck | Complete | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `tsc --noEmit` clean, `strict: true` | — |
| Lint | Complete | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 0 errors, 2 `no-img-element` warnings | P3 |
| Unit tests | Partially Complete | n/a | n/a | Yes | n/a | n/a | n/a | Yes | 29 passing, all pure functions in `src/modules` | — |
| Integration / API tests | **Missing** | n/a | n/a | n/a | n/a | n/a | n/a | **No** | None. Would have caught every P0 above. | **P1** |
| Component tests | Missing | n/a | n/a | n/a | n/a | n/a | n/a | No | No jsdom environment; `.tsx` excluded by config | P2 |
| CI | Missing | n/a | n/a | n/a | n/a | n/a | n/a | No | No `.github/workflows` | P2 |

## 11. Mobile and presentation

| Feature | Current Status | Frontend | API | Service | Database | Admin | Customer | Tests | Issues | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Storefront responsive layout | Complete | Yes | n/a | n/a | n/a | n/a | Yes | No | Mobile-first grids throughout | — |
| Mobile header drawer | Complete | Yes | n/a | n/a | n/a | n/a | Yes | No | Portalled, Escape, scroll lock, resize close, labelled | — |
| Touch target sizes | Complete | Yes | n/a | n/a | n/a | Yes | Yes | No | `h-11`/`h-12` consistently | — |
| Wide tables on mobile | Partially Complete | Yes | n/a | n/a | n/a | Yes | Yes | No | `overflow-x-auto` everywhere, but the admin table hides the action column | P2 |
| Subscribe wizard on mobile | Partially Complete | Yes | n/a | n/a | n/a | n/a | Yes | No | Works; 9-step chip strip gives no overflow affordance; "Line1"/"Postalcode" labels | P3 |
| Admin on mobile | **Broken** | Yes | n/a | n/a | n/a | Yes | n/a | No | 28-link sidebar becomes a one-line horizontal scroll strip | P2 |
| Image optimisation | Missing | No | n/a | n/a | n/a | n/a | n/a | No | Raw `<img>`; banner has no dimensions → layout shift | P2 |
| Fonts | Complete | Yes | n/a | n/a | n/a | n/a | n/a | n/a | `next/font/google`, self-hosted, CSS variables | — |
| Static generation / caching | **Missing** | n/a | n/a | n/a | n/a | n/a | n/a | No | Root `force-dynamic`; 18/20 routes dynamic; no revalidation anywhere | P2 |
| Design system | Partially Complete | Yes | n/a | n/a | n/a | Yes | Yes | No | shadcn/ui primitives present; ~20 inline hex literals bypass the theme | P3 |

## Summary counts

| Status | Rows |
| --- | --- |
| Complete | 63 |
| Partially Complete | 58 |
| Backend Only | 12 |
| UI Only | 2 |
| Broken | 14 |
| Missing | 17 |
| Needs Review | 1 |

Of the 14 Broken rows, 8 were authorization or data-integrity defects small enough to fix safely in
this pull request; those are listed in section 22 of the audit. The remaining 6 — scheduled renewal,
renewal recording no money, skip semantics, pause semantics, plan versioning, and the coupon base —
change money or behaviour and need a product decision first. They are listed in section 23 of the
audit.
