# BoxS subscription system audit

This is an audit of the system as it exists on `main` at commit `09b29ed`, not of the system as it
is described in `ARCHITECTURE.md`. Where the two disagree, this document records what the code does.

## How this audit was produced

Every claim below is backed by one of three things: a file read, a command that was run, or an HTTP
request that was issued against a running instance. Nothing was inferred from a file name or from
the existence of a UI page.

The verification environment:

- MariaDB 10.11 listening on `3317` with database `subscription_db`, user `subscription_user`
  (the app ships `@prisma/adapter-mariadb`, so the MariaDB wire protocol is the one it actually uses).
- `.env` copied from `.env.example` with a throwaway `AUTH_SECRET`.
- `npx prisma migrate deploy` — the single `20261002163441_init` migration applied cleanly.
- `npm run db:seed` — seeded without error.
- `npm run dev` on `http://127.0.0.1:3017`.
- `npm test` — 29 tests in 8 files, all passing.
- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors, 2 `no-img-element` warnings.
- `npm run build` — succeeds; 18 of 20 routes are dynamic.
- Sessions established over HTTP for `admin@boxs.demo` (super-admin) and `paolo@boxs.demo` (customer),
  then used to probe the API directly with `curl`.

Docker was **not** executed. No Docker daemon was available in the audit environment, so every Docker
finding below is from reading `Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`,
`scripts/docker-entrypoint.sh`, and `scripts/docker-check.mjs`. The equivalent stack was run natively
on the documented ports (`3017` app, `3317` database) to confirm the application itself works at those
ports and with those connection strings.

## Table of contents

1. [What BoxS is](#1-what-boxs-is)
2. [The real layer flow](#2-the-real-layer-flow)
3. [Foundation 1 — Plan Builder](#3-foundation-1--plan-builder)
4. [Foundation 2 — Subscription Engine](#4-foundation-2--subscription-engine)
5. [Foundation 3 — WordPress-like admin](#5-foundation-3--wordpress-like-admin)
6. [Database](#6-database)
7. [Pricing](#7-pricing)
8. [Plan versioning and historical prices](#8-plan-versioning-and-historical-prices)
9. [API architecture](#9-api-architecture)
10. [Repository and database abstraction](#10-repository-and-database-abstraction)
11. [Authentication and authorization](#11-authentication-and-authorization)
12. [Security](#12-security)
13. [Docker](#13-docker)
14. [Mobile-first review](#14-mobile-first-review)
15. [Performance](#15-performance)
16. [Testing](#16-testing)
17. [Hard-coded business rules](#17-hard-coded-business-rules)
18. [Admin usability](#18-admin-usability)
19. [Duplication](#19-duplication)
20. [Dead and unreachable code](#20-dead-and-unreachable-code)
21. [Issue register](#21-issue-register)
22. [Fixes applied in this pull request](#22-fixes-applied-in-this-pull-request)
23. [Decisions that need Ramil](#23-decisions-that-need-ramil)

---

## 1. What BoxS is

A single Next.js 16 application (App Router, React 19, TypeScript, Tailwind 4, shadcn/ui) backed by
MySQL through Prisma 7 with the MariaDB driver adapter. It is a modular monolith: there is one
deployable, and the business rules are grouped under `src/modules`.

The product intent is a general subscription platform where meal delivery is the demo catalog. The
seed data backs that claim up — alongside four meal plans there is a `Studio Membership` (monthly
recurring, "8 visits" vs "Unlimited") and a `Home Reset` cleaning service (weekly recurring, "1 visit"
vs "2 visits"). Both run through the same plan, pricing, and subscription tables as the meal plans.
Nothing in the schema or the engine is meal-specific.

Repository shape (139 tracked files, excluding `package-lock.json`):

```text
src/app          routes: (public) storefront, /admin, /api/v1 catch-all, /api/auth
src/components   ui (shadcn), site chrome, store wizard, admin screens, account forms
src/modules      pricing, subscriptions, checkout, coupons, delivery, orders, plans,
                 payments, webhooks, auth — business rules, no Prisma imports
src/repositories billing, catalog, plans, system, helpers — the only Prisma consumers
src/server       api.ts — the whole HTTP API in one function
src/database     client.ts — Prisma client singleton
src/lib          money, csv, slug, errors, rate-limit, utils
src/types        domain DTOs, next-auth augmentation
prisma           schema (40 models), one migration, seed
```

There is no `src/services`, no `src/validators`, no `src/config`, no `src/providers`, and no top-level
`tests` directory. `src/modules` plays the service role; tests are colocated as `*.test.ts`.

## 2. The real layer flow

There are two distinct paths to data, and only one of them goes through the API.

**Browser writes and client-component reads** follow the intended flow:

```text
client component → fetch /api/v1/... → handleApi() → module service → repository → Prisma → MySQL
```

**Server-component reads bypass the API and the service layer entirely:**

```text
server page/layout → repository → Prisma → MySQL
```

Every storefront page does this. `src/app/(public)/page.tsx` calls `plans.list`, `catalog.categories`,
and `system.page`. `src/app/(public)/plans/page.tsx` calls `plans.list` and `catalog.categories`.
`src/app/(public)/account/page.tsx` calls `billing.subscriptions`, `billing.orders`,
`system.notifications`, and `billing.addresses`. `src/app/(public)/layout.tsx` calls `system.menus`
and `system.settings` on every request. `src/components/admin/dashboard.tsx` calls `system.overview`.
`src/app/(public)/plans/[slug]/page.tsx` calls the `quoteSubscription` service directly for the
server-rendered first price.

This is a deliberate choice and `ARCHITECTURE.md` acknowledges it ("Server pages may call repositories
for reads"), but it has consequences the docs do not mention:

- Authorization for those reads lives in the page, not in one place. `/account` re-derives scoping
  by passing `userId: session.user.id` into `billing.subscriptions`. If a future page forgets, there
  is no second line of defence.
- The API is not the only contract. An external consumer calling `/api/v1` and a server page reading
  the same data can diverge, because only the API path runs `requirePermission`.

React components never compute prices and never import Prisma — verified by grep across
`src/components` and `src/app` for `database/client` and `@/generated/prisma`: zero matches. That part
of the stated architecture holds.

## 3. Foundation 1 — Plan Builder

**It exists and plans are genuinely data-driven, but the builder can only edit roughly half of what
the plan model supports, and saving through it destroys data.**

### How a plan is modelled

```text
SubscriptionType  billingMode, intervalUnit, intervalCount, deliveryCount   (shared across plans)
Plan              name, slug, price, discount, tax, delivery fee, currency,
                  nine lifecycle rule columns, startsAt/endsAt, status, featuredLabel, currentVersion
PlanOptionGroup   a question shown to the customer ("Duration", "Meals each day")
PlanOption        an answer, with priceDeltaCents and optional durationDays, deliveryCount,
                  intervalUnit, intervalCount, billingMode  → an option can change the term, not just the price
PlanItem          products/add-ons included in the plan
PlanVariant       a named combination of optionIds with an absolute priceOverrideCents
PlanVersion       a JSON snapshot written at publish time
```

That is a real plan builder data model. Durations, prices, term overrides, and lifecycle rules are
all rows, not code. An administrator does not need to edit source to add a plan or change a price —
confirmed by changing `Balanced Table` from ₱2,500 to ₱2,800 through `PATCH /api/v1/plans/:id` with
the admin session and seeing the storefront price move.

### What the Plan Builder UI can actually edit

`src/components/admin/plan-builder.tsx` exposes: name, slug, description, category, subscription type,
base price, delivery fee, built-in discount, tax, option groups (name, help text, and per-option
label / price delta / duration days), the four `allow*` booleans, `cancellationCutoffHours`, SEO
title/description, and the storefront label. Save draft and Publish.

What it cannot edit, although the model and the API support it:

| Not editable in the UI | Where it lives |
| --- | --- |
| Plan variants (named combinations with an override price) | `PlanVariant` |
| Included products and add-ons | `PlanItem` |
| `minCommitmentDays`, `changeCutoffHours`, `skipCutoffHours`, `deliveryChangeCutoffHours` | `Plan` |
| Per-option `deliveryCount`, `intervalUnit`, `intervalCount`, `billingMode` | `PlanOption` |
| Which option is the default (`isDefault`) | `PlanOption` |
| Group `required` flag, group reordering, option deletion, option reordering | `PlanOptionGroup` / `PlanOption` |
| `startsAt` / `endsAt` availability window | `Plan` |
| `imageUrl`, `currency` | `Plan` |

The per-option term fields are the significant omission. `resolveTerm` in
`src/modules/checkout/checkout-service.ts` reads `durationDays`, `deliveryCount`, `intervalUnit`,
`intervalCount`, and `billingMode` off the selected options to decide the subscription's term. The
seed sets these; the builder cannot. So a plan created in the admin can set how long a program runs
(via `durationDays`) but cannot set how many deliveries it contains or make an option switch a plan
between one-time and recurring. Those plans exist in the demo only because `prisma/seed.ts` wrote
them directly.

### Saving a plan through the builder deletes its items and variants

`plans.save` in `src/repositories/plans.ts` unconditionally deletes all `PlanOptionGroup`, `PlanItem`,
and `PlanVariant` rows for the plan and then recreates them from `input.groups ?? []`,
`input.items ?? []`, and `input.variants ?? []`. The Plan Builder never sends `items` or `variants`.

Verified directly. A `PlanItem` and a `PlanVariant` were inserted for `Balanced Table`, then the
exact payload shape the builder sends was issued as `PATCH /api/v1/plans/:id`:

```text
before: items=1 variants=1
after:  items=0 variants=0
```

Any administrator who opens a plan, changes one word of the description, and presses Save silently
loses every included product and every variant on that plan. This is the most serious Plan Builder
defect. See [P1-1](#21-issue-register).

### Editing a plan orphans references held by live subscriptions

Because option rows are deleted and recreated with new cuids, `SubscriptionItem.refId` values that
pointed at `PlanOption` rows become dangling. There is no foreign key on `refId`, so the database
accepts it. After the price-change test above:

```sql
SELECT COUNT(*) FROM SubscriptionItem si
WHERE si.kind='OPTION' AND si.refId NOT IN (SELECT id FROM PlanOption);
-- 1
```

`PlanVariant.optionIds` is a JSON array of option ids and would break the same way for any variant
that survived. The practical consequence is that a stored selection can no longer be re-quoted:
`assertPlanSelection` rejects unknown option ids with `INVALID_PLAN`, so a `change_plan` built from a
subscription's stored options would fail after any plan edit.

### Versioning

Covered in [section 8](#8-plan-versioning-and-historical-prices). Short version: orders and
subscriptions are safe, plan versions are not trustworthy.

### Could a non-technical administrator use it?

For a simple plan, yes. The form has plain-language help text on nearly every field, prices are
entered in pesos, and tax is entered as a percentage. The gaps that would send them to a developer:
setting a non-default duration, building a variant, including specific products, configuring any
cutoff other than cancellation, and changing which option is preselected.

## 4. Foundation 2 — Subscription Engine

**The state machine is real, pure, and tested. What is missing is everything that is supposed to
happen on a schedule — nothing renews, nothing is billed, and no delivery after the first one is
ever created.**

### Engine design

`src/modules/subscriptions/engine.ts` is a pure module with no I/O. Each transition takes a
`SubscriptionState` plus `now` and returns either `{ ok: true, state, event, message, data }` or
`{ ok: false, code, message }`. `src/modules/subscriptions/subscription-service.ts` adapts it to the
database and writes a `SubscriptionEvent` row inside the same transaction as the update
(`billing.applySubscription`). That is a clean separation and it is the strongest part of the
codebase.

All eight statuses from the brief exist in the Prisma enum: `PENDING`, `ACTIVE`, `PAUSED`, `PAST_DUE`,
`SUSPENDED`, `CANCELLED`, `EXPIRED`, `COMPLETED`.

### What actually reaches each status

| Status | Reachable? | How |
| --- | --- | --- |
| `PENDING` | Yes | Checkout where the provider does not return `CAPTURED` and is not `cod` |
| `ACTIVE` | Yes | Checkout with capture, `resume`, `renew`, `change_plan` |
| `PAUSED` | Yes | `pause` action |
| `PAST_DUE` | Only via a manual `renew` that fails | `renewSubscription(state, now, false)` |
| `SUSPENDED` | **No** | Nothing in the codebase ever writes it |
| `CANCELLED` | Yes | `cancel` action |
| `EXPIRED` | **No** | Nothing in the codebase ever writes it |
| `COMPLETED` | **No in practice** | `completeIfFinished` exists in `engine.ts` but is never imported or called anywhere |

`SUSPENDED`, `EXPIRED`, and `COMPLETED` are decorative. A 3-day fixed program runs past its
`periodEnd` and stays `ACTIVE` forever.

### Lifecycle verified live

Against seeded subscription `SB-10001` (`ONE_TIME`, `DAY`/3, ₱1,710, 3 deliveries remaining) using the
customer session:

| Action | Result | State after |
| --- | --- | --- |
| `pause` | OK | `PAUSED`, `periodEnd` unchanged, `nextDeliveryAt` unchanged, `remainingDeliveries` 3 |
| `resume` | OK | `ACTIVE`, `periodEnd` unchanged |
| `skip` | OK | `nextDeliveryAt` moved 2026-10-06 → 2026-10-07, `remainingDeliveries` still 3 |
| `renew` | Rejected, `NOT_RECURRING` | correct for a one-time plan |
| `cancel` | OK | `CANCELLED` |

Every transition wrote a `SubscriptionEvent`. The event log read back as
`SUBSCRIPTION_CANCELLED`, `DELIVERY_SKIPPED`, `SUBSCRIPTION_RESUMED`, `SUBSCRIPTION_PAUSED`,
`SUBSCRIPTION_CREATED`, `PAYMENT_SUCCESSFUL`. Subscription history works.

Three correctness problems fall out of that table:

1. **Pause is cosmetic for a fixed-term plan.** `pauseSubscription` sets `status` and `pausedAt` and
   nothing else. `resumeSubscription` only extends `periodEnd` if the period had already elapsed
   while paused. A customer who pauses a 30-day program for 10 days gets 20 days of value. `pausedAt`
   is stored but never read.
2. **Skip advances the delivery by exactly one calendar day** (`addInterval(state.nextDeliveryAt, "DAY", 1)`)
   regardless of the plan's interval or the zone's delivery schedule. For a weekly plan the next
   delivery moves from, say, Tuesday to Wednesday rather than to the following Tuesday. The seeded
   Davao zone has no Sunday window, so a skip from Saturday lands on a day the zone cannot deliver.
3. **Skip does not decrement `remainingDeliveries`.** A skipped delivery is deferred, never consumed,
   so a fixed-delivery program never converges on zero — which is also why `completeIfFinished` would
   never fire even if it were called.

### Renewal is the largest gap

There is no scheduler, no cron, no queue, and no background worker anywhere in the repository.
Searching the whole of `src` for `cron`, `scheduler`, and `setInterval` returns nothing. The only way
a subscription renews is an explicit `POST /api/v1/subscriptions/:id/actions` with
`{"action":"renew"}`. `Subscription.nextBillingAt` is written and indexed, and nothing ever reads it.

Worse, when `renew` does run it does not record the money. A recurring `Family Table` subscription
(`SB-10002`, ₱4,400/week) was created through a real checkout and then renewed:

- `periodEnd` and `nextBillingAt` advanced by one week — correct.
- `Payment` rows for that subscription: **1** (the original checkout). No payment row for the renewal.
- `Order` rows for that subscription: **1**. No order for the new period.
- No `DeliveryAssignment` for the new period.

`actOnSubscription` calls `provider.createRecurringPayment(...)` — the seam where a real PSP would be
charged — and then throws the returned `ProviderPayment` away except for its status. With a real
provider that is money taken and no record of it. The admin dashboard computes revenue by summing
`Payment` rows with status `CAPTURED`, so renewal revenue would never appear in reports.

And because the customer owns the action, they can run it themselves. Four consecutive
`{"action":"renew"}` posts from the customer session moved `periodEnd` from `2026-10-10` to
`2026-11-07` — four free weeks — while the payment and order counts stayed at 1 and 1.

### Other lifecycle operations

- **Plan change** (`change_plan`) is implemented and prorates properly: `proratePlanChange` credits
  the unused fraction of the current period, charges the difference, and carries leftover credit on
  `Subscription.creditCents`. It writes an audit log and a `PLAN_CHANGED` event. There is **no UI for
  it** — the "Change plan" button in `src/components/account/subscription-actions.tsx` is a plain
  link to `/plans`. API-only.
- **Address change** works but does not verify the supplied `addressId` belongs to the subscription's
  customer; it does `address: { connect: { id: input.addressId } }` with whatever id arrives.
- **Delivery date change** works and enforces `deliveryChangeCutoffHours`, but does not check the new
  date against the zone's `DeliverySchedule`, so a customer can move a delivery to a non-delivery day.
- **Payment failure** only exists as the `paid === false` branch of `renewSubscription`, which sets
  `PAST_DUE`. Nothing retries, nothing dunns, nothing escalates `PAST_DUE` to `SUSPENDED`.
- **Webhooks** verify an HMAC signature and store the event idempotently
  (`@@unique([provider, eventId])`), and then do nothing with it. `processWebhook` never updates a
  `Payment`, never moves a subscription, never touches an order. An asynchronous capture or a failed
  recurring charge from a real PSP would be logged and ignored.

## 5. Foundation 3 — WordPress-like admin

The admin is `src/app/admin/[[...section]]/page.tsx`, a single optional-catch-all route that
dispatches to four components: `Dashboard`, `PlanBuilder`, `OrderDetail`, and a generic
`RecordBrowser` for everything else. `RecordBrowser` renders a search box, a table from a column
list, optional bulk buttons, and mounts `ModuleForms`, which supplies a create form per module.

The sidebar in `src/app/admin/layout.tsx` lists 28 entries and filters them by permission. The layout
redirects anonymous users to `/login?next=/admin` and customers to `/account` — verified: the customer
session gets a 307 on `/admin`, the admin session gets 200 on all 26 admin routes tested.

Feature-by-feature state. "API" means a `/api/v1` route exists; "Logic" means there is behaviour
beyond a CRUD write; "Validation" means input is checked before it reaches the database.

| Feature | UI | API | DB | Logic | Validation | Permissions | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard / reports | Yes | Yes | Yes | Yes | n/a | `reports.view` | No |
| Global search | Yes | Yes | Yes | Yes | No | **any signed-in user** | No |
| Customers | List + suspend/activate bulk | Yes | Yes | Minimal | No | `customers.view/edit` | No |
| Plans | List + Plan Builder | Yes | Yes | Yes | No | `plans.*` | No |
| Plan Builder | Partial (see §3) | Yes | Yes | Yes | No | `plans.create/edit` | No |
| Products | List + create | Yes | Yes | CSV import | Minimal | `products.*` | No |
| Categories | List + create | Yes | Yes | No | No | `products.*` | No |
| Add-ons | List + create | Yes | Yes | No | No | `products.*` | No |
| Subscriptions | **List only** | Yes | Yes | Yes | No | `subscriptions.*` | Engine only |
| Orders | List + detail + status | Yes | Yes | Yes | No | `orders.*` | No |
| Payments | List | Yes | Yes | Refund endpoint | No | `payments.*` | No |
| Deliveries | List + zone create | Yes | Yes | Cutoff/capacity | No | `deliveries.*` | Availability only |
| Coupons | List + create | Yes | Yes | Yes | No | **GET is public** | Yes |
| Content (pages) | List + create | Yes | Yes | No | No | `content.edit` | No |
| Media | List + upload | Yes | Yes | File write | Type + size | `media.edit` | No |
| Users | List + create | Yes | Yes | No | Minimal | `users.*` | No |
| Roles | List + create | Yes | Yes | Yes | No | **GET is public** | Preset test |
| Permissions | List | Yes | Yes | n/a | n/a | **GET is public** | Yes |
| Settings | List + edit | Yes | Yes | No | No | **GET is public** | No |
| Feature flags | List + toggle | Yes | Yes | One flag is read | No | **GET is public** | No |
| Notifications | Template on/off | Yes | Yes | In-app only | No | `notifications.manage` | No |
| Integrations (webhooks) | List | Yes | Yes | Signature only | No | `api.manage` | Yes |
| API keys | Create + list | Yes | Yes | **None** | No | `api.manage` | No |
| Audit logs | List | Yes | Yes | Written on 4 actions | n/a | `audit.view` | No |

Notable holes:

- **There is no admin subscription detail screen.** `RecordBrowser` only renders row links for `plans`
  and `orders`. An administrator can see the subscription list but cannot open one, so cannot pause,
  cancel, change, or inspect the event history of a customer's subscription from the UI. Every
  subscription action an administrator might need is API-only.
- **API keys do nothing.** `system.createApiKey` generates `bx_<48 hex>`, stores a SHA-256 hash, and
  returns the secret once. Nothing in the codebase ever verifies an API key. Grep for `keyHash`
  outside the generated Prisma client returns exactly one hit, the insert. `lastUsedAt` is never
  written. The entire "API" admin section is a key generator for an authentication scheme that does
  not exist.
- **Email and SMS do not send.** `.env.example` has `EMAIL_PROVIDER=console` and `SMS_PROVIDER=console`,
  and nothing reads either variable. `system.notify` writes `Notification` rows for whichever channels
  have an enabled `NotificationTemplate`. If an administrator enables the EMAIL template, the system
  writes rows with `channel: EMAIL` that are never delivered anywhere.
- Audit logging covers checkout, plan publish, plan change, and subscription actions. Plan edits,
  price changes, user creation, role changes, refunds, and settings changes are **not** audited.
- There is no `/admin/contact` screen even though `ContactMessage` rows are created by the public
  contact form and `system.contacts()` exists to read them.

## 6. Database

40 models, one migration (`20261002163441_init`), 50 foreign keys, 88 indexes of which 23 are unique.
All money is `INTEGER` centavos. Character set is `utf8mb4` / `utf8mb4_unicode_ci` throughout.

The entity list from the brief is almost entirely present, and in equivalent form where the name
differs. Nothing in that list needs a new table:

| Brief's entity | In BoxS |
| --- | --- |
| users, roles, permissions | `User`, `Role`, `Permission`, `RolePermission` |
| customers | `CustomerProfile` (1:1 with `User`) |
| addresses | `Address` |
| categories, products, product variants | `Category`, `Product`, `ProductVariant` |
| plans, plan variants, plan prices, plan versions | `Plan`, `PlanVariant`, `PlanVersion`; price columns live on `Plan` and `PlanOption` rather than a separate price table |
| subscription types | `SubscriptionType` |
| subscriptions, subscription items, subscription events | `Subscription`, `SubscriptionItem`, `SubscriptionEvent` |
| orders, order items, order snapshots | `Order`, `OrderItem`, `OrderSnapshot` |
| payments, payment transactions | `Payment`, `PaymentTransaction` |
| delivery zones, schedules, assignments | `DeliveryZone`, `DeliverySchedule`, `DeliveryAssignment` |
| coupons, coupon redemptions | `Coupon`, `CouponRedemption` |
| notifications | `Notification`, `NotificationTemplate` |
| settings | `Setting`, `FeatureFlag` |
| audit logs | `AuditLog` |
| webhook events | `WebhookEvent` |
| add-ons | `Addon`, `PlanItem` |

### What is wrong with it

**Referential integrity gaps**

- `SubscriptionItem.refId` is a free `String?` pointing at `Plan`, `PlanOption`, or `Addon` ids
  depending on `kind`. No foreign key, no constraint, no enum on `kind`. Confirmed to go dangling
  after a plan edit (§3).
- `PlanVariant.optionIds` is a JSON array of `PlanOption` ids. Same class of problem, plus it cannot
  be joined or indexed.
- `SubscriptionEvent.actorId` and `AuditLog.actorId` are both `String?` user ids, but only `AuditLog`
  has the relation. `SubscriptionEvent.actorId` has no foreign key.
- `WebhookEvent.status` and `SubscriptionItem.kind` and `PaymentTransaction.type` are free strings
  where enums exist elsewhere in the same schema for comparable concepts.

**Missing constraints**

- Nothing prevents two `PlanOption` rows in the same group from both having `isDefault = true`. The
  seed produces exactly that for `Balanced Table`:

  ```text
  duration | 3 days  | isDefault=1 | sortOrder=0
  duration | 5 days  | isDefault=0 | sortOrder=1
  duration | 7 days  | isDefault=1 | sortOrder=2
  ```

  The cause is `isDefault: option.isDefault ?? optionIndex === 0` in `prisma/seed.ts`, which marks
  the first option as default even when the plan author marked a different one. The storefront's
  `previewPlan` picks whichever `find()` reaches first, so the "From" price on `/plans` is the 3-day
  price (₱1,900) while the plan's intended default is 7 days (₱2,700). Same for the wizard's
  preselection.
- Nothing prevents more than one default `Address` or `PaymentMethod` per customer at the database
  level; `billing.saveAddress` clears the others in application code, which is not atomic with the
  insert.
- `DeliverySchedule.dayOfWeek` is an unconstrained `Int`, and `windowStart`/`windowEnd`/`cutoffTime`
  are unvalidated `String` clock values parsed with `value.split(":").map(Number)`.
- `Coupon.value` means percent for `PERCENT` and centavos for `FIXED` in the same column, with no
  range constraint. A `PERCENT` coupon with value 500 is accepted.

**Missing timestamps**

`PlanOptionGroup`, `PlanOption`, `PlanItem`, `PlanVariant`, `OrderItem`, `SubscriptionItem`,
`RolePermission`, `Permission`, `ContentBlock`, and `MenuItem` have no `createdAt`/`updatedAt`. For
the plan option tables this matters: they are the rows that get deleted and recreated, and there is
no way to tell when.

**Soft delete is inconsistent**

`deletedAt` exists on `User`, `Address`, `Category`, `Product`, `Addon`, `Plan`, `Page`, and `Coupon`.
It does not exist on `Subscription`, `Order`, `Payment`, `DeliveryZone`, `DeliverySchedule`, or
`ProductVariant`. Some repository reads filter on it and some do not — `billing.payments` and
`billing.deliveries` have no soft-delete filter because their models have no column, but
`system.users` filters and `catalog.subscriptionTypes` does not need to. The inconsistency is survivable
but it is a trap for the next person adding a query.

**Indexes**

Coverage is good for the common access paths: `Subscription` is indexed on `customerId`, `planId`,
`status`, `nextDeliveryAt`, and `nextBillingAt`; `Order` on `customerId`, `subscriptionId`, `status`,
and `placedAt`. What is missing:

- No index supports the search queries. `billing.customers` searches `user.name` / `user.email` with
  `contains`, `billing.orders` searches `number` and customer name, `system.search` runs six
  `contains` queries at once. `contains` on an unindexed `VARCHAR(191)` is a full scan; none of these
  columns has a prefix or full-text index.
- `CouponRedemption` has indexes on `couponId` and `customerId` separately, but `billing.couponUsage`
  counts on the pair. A composite `@@index([couponId, customerId])` would serve it directly.
- `DeliveryAssignment` has `@@index([zoneId])`, `@@index([deliveryDate])`, `@@index([status])`, but
  `billing.booked` filters on `scheduleId` + `deliveryDate` + `status`. `scheduleId` is not indexed.

**Order-number generation is a race**

`nextNumber` in `src/repositories/billing.ts` reads a `Setting` row, adds one, and upserts it back
inside the checkout transaction. Under MySQL's default `REPEATABLE READ` two concurrent checkouts can
read the same value. `Order.number` and `Subscription.number` are unique, so the loser gets a
constraint violation and the whole checkout rolls back rather than retrying. It fails safe, but it
fails.

**Prices are correctly denormalised**

`Order` carries `subtotalCents`, `variantCents`, `addonCents`, `discountCents`, `couponCents`,
`taxCents`, `deliveryFeeCents`, `totalCents`; `OrderItem` carries its own unit and total;
`OrderSnapshot.payload` holds the full quote; `Subscription.priceCents` and
`Subscription.priceSnapshot` hold the agreed price. This is the right shape and it is what makes
[section 8](#8-plan-versioning-and-historical-prices) come out well.

## 7. Pricing

### The canonical calculation

`calculatePrice` in `src/modules/pricing/pricing-service.ts` is the single formula, and it is genuinely
single:

```text
preTax      = base + variantDelta + addons + deliveryFee
tax         = round(preTax * taxRateBps / 10000)
beforeCoupon= preTax + tax - discount
coupon      = clamp(couponAmount(beforeCoupon), 0, beforeCoupon)
total       = max(0, beforeCoupon - coupon)
```

Every consumer goes through it: `quoteSubscription` (storefront, wizard, `POST /pricing/quote`),
`checkout` (via `quoteSubscription`), `previewPlan` (plan cards and the comparison table),
`change_plan` (via `quoteSubscription`). There is no second implementation of the formula anywhere
in the repository, and no pricing arithmetic in any React component. This is the healthiest part of
the system.

Verified against a live quote for `Balanced Table` + 3-day + 1 meal/day + Regular:

```json
{"baseCents":250000,"variantCents":-80000,"addonCents":0,"deliveryFeeCents":20000,
 "taxCents":0,"discountCents":0,"couponCents":0,"totalCents":190000}
```

₱2,500 − ₱800 + ₱200 = ₱1,900. Correct.

### The one real pricing bug: the coupon is computed twice from two different bases

`evaluateCoupon` in `src/modules/coupons/coupon-service.ts` ends with:

```ts
const amountCents = coupon.type === "PERCENT"
  ? Math.round((context.subtotalCents * coupon.value) / 100)
  : coupon.value;
return { ok: true, amountCents: Math.max(0, amountCents) };
```

`quoteSubscription` passes `subtotalCents = base + variantDelta + addons` — no delivery fee, no tax,
no built-in discount. That `amountCents` is then **discarded**. The number that reaches the customer
comes from `calculatePrice`, which applies the percentage to `beforeCoupon`, which *does* include
delivery and tax.

Verified with `WELCOME10` (10%) on the quote above:

```text
evaluateCoupon would say:   10% of 170000 = 17000   (₱170)
calculatePrice actually applies:  10% of 190000 = 19000   (₱190)
```

So a percentage coupon discounts the delivery fee and the tax. Two defects in one: the discount is
larger than the eligibility check assumes, and a reader of `evaluateCoupon` would reasonably conclude
the opposite of what happens. `COUPON_MINIMUM` is also evaluated against a different subtotal than
the one the customer is charged on.

### Other pricing observations

- `equivalentPrices` derives weekly as `daily × 7` and monthly as `daily × 30` from a rounded daily
  figure, so the comparison table's "Monthly equivalent" compounds rounding error — ₱1,900 over
  3 days shows as ₱633.33/day, ₱4,433.31/week, ₱18,999.90/month. Presentational, but wrong by up to
  30× the rounding step.
- `variantDeltaCents` has two meanings. When a `PlanVariant` matches the selection exactly, it is
  `priceOverrideCents - plan.basePriceCents` (an absolute override expressed as a delta). Otherwise
  it is the sum of the selected options' deltas. Both land in the same `variantCents` column on the
  order, so an order cannot be told apart afterwards.
- `taxRateBps` lives on the plan, and a `tax.rate_bps` row also exists in `Setting`. Nothing reads
  the setting. Two sources of truth for tax, one of them inert.
- The delivery fee resolution order is zone fee first, plan fee as fallback
  (`const deliveryFeeCents = zone ? zone.feeCents : plan.deliveryFeeCents`). That is sensible, but it
  means the plan's delivery fee is only ever used when no zone is selected — which is exactly the
  storefront preview path, so the "From" price on `/plans` is computed with the plan fee while
  checkout uses the zone fee.
- Nothing applies `automatic` coupons. `Coupon.automatic` exists and is settable; no code reads it.

## 8. Plan versioning and historical prices

### Historical transactions are protected — verified

The ₱2,500 → ₱2,800 test from §3, re-read after the change:

| | Before | After |
| --- | --- | --- |
| `Plan.basePriceCents` | 250000 | **280000** |
| `Order BX-10001.totalCents` | 171000 | **171000** |
| `Subscription SB-10001.priceCents` | 171000 | **171000** |

Three independent mechanisms do this, which is more belt-and-braces than most systems manage:

1. `Order` stores every component of the price as its own column.
2. `OrderSnapshot.payload` stores the full quote plus plan name, slug, version, selected options,
   add-ons, included products, and the customer's name and email at the time.
3. `Subscription.priceCents` and `Subscription.priceSnapshot` hold the agreed price, and renewals use
   `current.priceCents` rather than re-quoting the plan.

The FAQ answer seeded into the database — "New orders use the new price. Orders already placed keep
the amount that was charged" — is accurate.

### Plan versions themselves are not trustworthy

The same test, looking at `PlanVersion`:

| | Before | After |
| --- | --- | --- |
| `Plan.currentVersion` | 1 | **1** |
| `PlanVersion` v1 `snapshot.basePriceCents` | 250000 | **250000** |

A published plan can be edited in place without a version bump. `plans.save` never touches `status`
or `currentVersion`; only `plans.publish` does. So after that edit the live plan sells at ₱2,800 while
`PlanVersion` v1 claims ₱2,500, and `Subscription.planVersionId` points at v1 for both the customer
who bought at ₱2,500 and any customer who buys at ₱2,800. The version link exists but no longer
identifies what was sold.

Two further weaknesses:

- `prisma/seed.ts` writes `PlanVersion` snapshots containing only `{ name, basePriceCents }`, while
  `plans.publish` writes the full `PlanDTO`. Two different snapshot shapes in the same table with no
  schema and no discriminator.
- Nothing ever reads `PlanVersion.snapshot`. It is written at publish and never consulted — not by
  checkout, not by renewal, not by the admin. Order-level snapshots carry the real weight.

Net assessment: **immutable order pricing works; plan versioning is decorative.** The recommended fix
is small and does not require new tables — bump the version and write a snapshot whenever a
`PUBLISHED` plan is saved, and set `Subscription.planVersionId` from the version that was actually
quoted rather than from `currentVersion` at persist time.

## 9. API architecture

### Shape

One file, `src/server/api.ts`, exports `handleApi(method, request, slug)`. One route,
`src/app/api/v1/[...slug]/route.ts`, maps GET/POST/PATCH/DELETE onto it. One exception,
`src/app/api/v1/media/upload/route.ts`, which handles multipart separately and correctly.

`handleApi` is a 430-line chain of `if (resource === "..." && method === "...")` guards. Response
envelope is consistent everywhere: `{ success: true, data }` or
`{ success: false, error: { code, message } }`, with `AppError` carrying the HTTP status and a plain-
language message. That consistency is a genuine strength — every error the customer can see is written
in English rather than exposing an exception.

Versioning is in place at `/api/v1/`, which matches the brief's preference.

### What is wrong with it

**There is no input validation.** `zod` is in `dependencies` at `^4.6.5` and is imported exactly
nowhere — grep for `from "zod"` across `src` returns zero matches. Request bodies are read with
`await request.json().catch(() => ({}))` and then handed to repositories as `body as PlanWrite`,
`body` for `saveCoupon`, `body` for `saveZone`, and so on. The only checks that exist are hand-rolled:
email/password presence in `register`, password length in `register` and `account`, file type and
size in the media upload. `basePriceCents` is never checked to be a non-negative integer. A plan can
be saved with a negative price. `Coupon.value` is never range-checked.

**The if-chain has ordering hazards.** Routes are matched by position, so `/plans/bulk` and
`/plans/slug/:slug` only work because they are declared before the generic `/plans/:id`. Adding a
plan whose id is literally `bulk` or `slug` would shadow them. The same pattern repeats for
`/products/import`, `/customers/bulk`, `/orders/bulk`, `/notifications/templates`,
`/delivery/zones`, and `/delivery/schedules`. There is no route table to inspect — correctness depends
on reading 430 lines in order.

**Business logic in the route handler.** `POST /products/import` parses CSV, validates rows,
accumulates an error list, and loops `catalog.saveProduct` — all inline in `handleApi`. `POST
/customers/bulk` loops `system.updateUser` inline. `POST /orders/bulk` maps an action string to an
`OrderStatus` inline. `POST /payments/:id/refund` orchestrates the payment write and the order status
change inline, and never calls the provider's `refundPayment`. `GET /exports/:kind` builds CSV inline.
None of these have a service module, so none of them are testable without HTTP.

**Authorization is applied per-branch and is missing in several places.** Full detail in
[section 11](#11-authentication-and-authorization). The pattern — call `requirePermission` by hand in
each of ~60 branches — guarantees that an omission is invisible.

**Inconsistent handling of absent fields.** `PATCH /plans/:id` treats a missing `items` key as "delete
all items" rather than "leave unchanged" (§3). `PATCH /products/:id` gets it right — it only touches
variants `if (input.variants)`.

**No pagination on several list endpoints.** `GET /delivery/zones` returns every zone with every
schedule. `GET /settings`, `/feature-flags`, `/permissions`, `/roles`, `/menus`, `/faqs`, `/pages`
return everything. `GET /webhooks` and `/api-keys` hard-cap at 50 with no cursor. `GET /exports/:kind`
hard-caps at `pageSize: 100`, so an "export" of a 5,000-customer list silently returns the first 100
rows — the most misleading of the group.

**`docs/openapi.yaml` describes 5 of roughly 60 endpoints** and is labelled a sketch in `API.md`.
`API.md` itself is accurate and thorough; the OpenAPI file is not a usable contract.

## 10. Repository and database abstraction

The repository layer is real. `src/repositories/{billing,catalog,plans,system,helpers}.ts` are the only
files outside `src/database/client.ts` and `prisma/seed.ts` that import Prisma — verified by grep.
`src/modules/*` import no Prisma at all, which is what makes them unit-testable without a database.

What would make a move away from MySQL/Prisma hard:

1. **Prisma types leak across the boundary.** `billing.applySubscription(id, data: Prisma.SubscriptionUpdateInput, …)`
   takes a Prisma input type as a parameter, and `subscription-service.ts` — a module file — constructs
   `{ plan: { connect: { id } } }` and `{ address: { connect: { id } } }`. That is Prisma relation
   syntax inside the business layer. Any replacement adapter would have to emulate Prisma's update
   shape.
2. **Repositories are object literals, not interfaces.** `export const billing = { … }` with no
   `interface BillingRepository`. There is no contract to implement against and no seam for a test
   double; consumers import the concrete singleton directly.
3. **Transactions are Prisma-specific.** `prisma.$transaction` with a `Prisma.TransactionClient`
   callback in `persistCheckout`, and an array-form `$transaction` in `applySubscription`. A Firebase
   or REST-backed implementation has no equivalent.
4. **Some repository returns are raw Prisma rows.** `billing.zones()`, `billing.payment()`,
   `system.settings()`, `system.roles()` (partly), `system.permissions()`, `catalog.saveSubscriptionType()`,
   and others return model objects straight from Prisma, including `Date` instances. Others map to
   hand-written DTOs with ISO strings. Consumers depend on whichever they got.
5. **Enum values are Prisma-generated.** `OrderStatus`, `PaymentStatus`, `SubscriptionStatus`,
   `RecordStatus` are imported from `@/generated/prisma/client` into the repositories and cast from
   strings (`query.status as SubscriptionStatus`).
6. **Error translation is Prisma-specific.** `helpers.rethrow` maps `P2002` and `P2025` to `AppError`.
   That mapping would need re-implementing per adapter — though it is at least in one place.

Changing the *database* within Prisma (MySQL → PostgreSQL) is comparatively cheap: swap the
`datasource` provider and the adapter, regenerate, and re-baseline the migration. The `Json` columns
(`PlanVersion.snapshot`, `PlanVariant.optionIds`, `Subscription.rules`, `Subscription.priceSnapshot`,
`Order.addressSnapshot`, `OrderSnapshot.payload`, `AuditLog.oldValue`/`newValue`,
`WebhookEvent.payload`, `ProductVariant.attributes`) all map to `jsonb`. Changing the *ORM* or moving
to an external API is a rewrite of `src/repositories` plus the three leaks above.

## 11. Authentication and authorization

### Authentication

Auth.js v5 (`next-auth@5.0.0-beta.32`) with a credentials provider and JWT sessions. Passwords are
bcrypt at cost 12 — correct, both at registration and at password change. `authorize` rejects users
who are not `ACTIVE` or who have `deletedAt` set. `trustHost: true`. The JWT carries `uid`, `role`
slug, and the flattened permission key list.

Sign-in works. The earlier report of a broken login was against an older commit; on `main` at
`09b29ed` a credentials POST returns 302 and `/api/auth/session` returns a populated session for
both the admin and the customer account. `loginAction` calls `signIn(..., { redirect: false })`,
catches `AuthError`, and redirects to `/login?error=1`, and the login page renders
"Those details were not recognized."

Registration exists (`POST /api/v1/register`) and is rate-limited to 5 attempts per email per minute.
Login is rate-limited to 10 per email per minute. Both limiters are an in-process `Map` in
`src/lib/rate-limit.ts` — per Node process, cleared on restart, useless behind more than one
instance, and keyed on the submitted email so an attacker rotating emails is unlimited.

**There is no password reset.** No forgot-password route, no reset token model, no email delivery. A
customer who forgets their password has no path back in. `UserStatus.INVITED` exists in the enum and
nothing ever sets it, which suggests an invite flow was intended and not built.

Logout works via a server action calling `signOut`.

### Authorization model

`src/modules/auth/permissions.ts` defines 32 permission keys across 14 modules and 9 role presets.
`can(permissions, key, role)` short-circuits `true` for `super-admin` and otherwise checks membership.
It is covered by a unit test. The seed creates all 9 roles with their preset permissions.

The model is sound. The application of it is not, because it is hand-written per endpoint.

### Can customer A reach customer B's data?

Tested with a live customer session (`paolo@boxs.demo`, role `customer`, zero permissions).

**Correctly scoped:**

| Probe | Result |
| --- | --- |
| `GET /api/v1/subscriptions` | 1 item, only Paolo's |
| `GET /api/v1/orders` | 1 item, only Paolo's |
| `GET /api/v1/subscriptions/:id` for another customer | 403 by explicit ownership check |
| `POST /api/v1/subscriptions/:id/actions` on another customer's subscription | 403 |
| `GET /api/v1/payments` | 403 |
| `GET /api/v1/customers` | 403 |
| `GET /api/v1/audit-logs` | 403 |
| `POST /api/v1/plans` | 403 |
| `POST /api/v1/media` | 403 |
| `GET /admin` | 307 to `/account` |

**Not scoped — confirmed broken:**

| Probe | Result |
| --- | --- |
| `GET /api/v1/exports/customers` as a customer | **200.** Full CSV of every customer: id, userId, name, email, phone, status, counts. |
| `GET /api/v1/exports/orders` as a customer | **200.** Every order, including `addressSnapshot`. Same for `/exports/subscriptions`. |
| `GET /api/v1/search?q=liza` as a customer | **200.** Returns `{"customers":[{"id":"…","name":"Liza Tan","email":"liza@boxs.demo"}]}` |
| `DELETE /api/v1/account/addresses/<another customer's id>` | **200 `{"deleted":true}`.** `deletedAt` was set on Liza's address by Paolo's session. |
| `POST /api/v1/subscriptions/:id/actions {"action":"renew"}` on own subscription | **200, repeatedly.** Four calls advanced `periodEnd` by four weeks with no payment recorded. |
| `GET /api/v1/orders/:id` **unauthenticated** | **200.** Full order with customer name and delivery address. No session required at all. |

The cause in every case is a missing or too-weak guard in `src/server/api.ts`:
`exports` and `search` call `requireUser` where they should call `requirePermission`;
`account/addresses` DELETE calls `requireUser` and then deletes by raw id;
`orders/:id` GET has no guard of any kind; `renew` is reachable by the subscription's owner because
`actOnSubscription` applies one ownership test to all eight actions.

**Unauthenticated reads that should not be public:**

| Endpoint | Leaks |
| --- | --- |
| `GET /api/v1/coupons` | Every coupon code, type, value, scope, limits, and redemption count — `WELCOME10`, `DAVAO50`, `EXPIRED` all returned to an anonymous caller |
| `GET /api/v1/settings` | Business name, city, currency, timezone, tax rate, SEO defaults, and the internal order/subscription sequence counters |
| `GET /api/v1/roles` | Every role with its full permission id list |
| `GET /api/v1/permissions` | The full permission catalogue |
| `GET /api/v1/feature-flags` | Every flag and its state |

All five are consumed only by admin screens. None is needed by the public storefront, which reads
through server components.

### Admin-side authorization

Within the admin, permissions are enforced on the API and on sidebar visibility, but not on the page.
`/admin/<anything>` renders `RecordBrowser` for any staff role; a content manager who types
`/admin/payments` gets the page shell and an error toast from the 403, rather than a redirect. Low
severity, but it tells a restricted user which modules exist.

## 12. Security

Ordered by risk. Each entry says how it was established.

### High

1. **`GET /api/v1/orders/:id` requires no authentication.** `curl` with no cookie returned order
   `BX-10001` in full: customer name, every price component, coupon code, subscription number, and
   the complete `addressSnapshot` (street, city, region, postal code). Order ids are cuids so this is
   not enumerable by brute force, but ids appear in admin URLs, in CSV exports, and in the API
   responses customers already receive. Broken object-level authorization.
2. **Any signed-in user can export the whole database as CSV.** `GET /api/v1/exports/customers`,
   `/orders`, `/subscriptions`, `/products`, `/plans` only call `requireUser`. A customer who
   registers through the public form can download every other customer's name, email, phone, and
   every order with its delivery address. This is the single highest-impact finding.
3. **Any signed-in user can delete any address.** `DELETE /api/v1/account/addresses/:id` calls
   `requireUser` and then `billing.removeAddress(extra)` with no ownership check. Demonstrated
   cross-customer.
4. **A customer can extend their own paid period for free.** `{"action":"renew"}` is reachable by the
   subscription owner, moves `periodEnd` and `nextBillingAt` forward one interval per call, and
   records no `Payment` and no `Order`. Four calls, four free weeks, verified.
5. **Production containers seed demo super-admin credentials.** `scripts/docker-entrypoint.sh` ends
   with `npx tsx prisma/seed.ts`, and `Dockerfile`'s `runner` stage runs that entrypoint, as does
   `docker-compose.prod.yml`. On a fresh production database this creates `admin@boxs.demo` with the
   password `DemoAdmin123!` in the `super-admin` role — a password that is also printed on the public
   `/login` page and in `README.md`. Combined with `trustHost: true` and a default `AUTH_SECRET` of
   `replace-with-a-long-random-string` in `.env.example`, a deployment that ships as-is is fully
   compromised on first boot.
6. **Stored XSS through the plan JSON-LD block.** `src/app/(public)/plans/[slug]/page.tsx` renders
   `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}` inside a
   `<script type="application/ld+json">`. `JSON.stringify` does not escape `<` or `/`, so a plan name
   can close the script tag. Verified by setting a plan name to
   `Pwn</script><script>alert(1)</script>` and fetching `/plans/balanced-table`; the served HTML
   contains the literal closing tag followed by the attacker's script element. Requires
   `plans.edit` (Manager and above), and executes in every anonymous visitor's browser — including a
   super-admin browsing the storefront.

### Medium

7. **No input validation layer.** `zod` is a dependency and is never imported. Bodies reach
   repositories unvalidated; see §9. The exposure is bounded because Prisma parameterises everything
   (no SQL injection surface was found — there is no `$queryRaw`, no `$executeRaw`, no string-built
   SQL anywhere), but type confusion and out-of-range values are wide open.
8. **Anonymous reads of `coupons`, `settings`, `roles`, `permissions`, `feature-flags`.** Section 11.
   The coupon list is the material one: every discount code in the business, to anyone.
9. **No CSRF protection on the custom API.** Session auth is cookie-based and `/api/v1` accepts
   JSON bodies on POST/PATCH/DELETE with no origin check and no token. A cross-site
   `application/json` POST triggers a CORS preflight that the app does not answer, which blocks the
   straightforward attack, but the app relies on browser defaults rather than on its own check.
   Auth.js handles CSRF for its own routes only.
10. **Rate limiting is in-process and nearly symbolic.** One `Map`, two call sites (login, register).
    Nothing limits checkout, the quote endpoint, the search endpoint, or the subscription action
    endpoint. Lost on restart, not shared across instances.
11. **SVG uploads are accepted.** `media/upload` allows anything matching `image/*`, which includes
    `image/svg+xml`, and writes it to `public/uploads/` where it is served same-origin. An uploaded
    SVG containing a script is stored XSS for anyone who opens the file URL. Requires `media.edit`.
    The rest of the upload handling is sound: filename is sanitised to `[A-Za-z0-9._-]`, prefixed with
    a timestamp, and written under a fixed directory, so there is no path traversal; size is capped
    at 8 MB.
12. **Webhook secret defaults to empty.** `src/server/api.ts` passes
    `secret: process.env.PAYMENT_SECRET || ""`. If the variable is unset, `verifyWebhookSignature`
    still runs an HMAC with an empty key, so an attacker who knows the body can compute a valid
    signature. The signature comparison itself is correct — `timingSafeEqual` with a length guard.
13. **Demo credentials printed on the login page.** Hard-coded in
    `src/app/(public)/login/page.tsx`, not behind a flag or an environment check.
14. **Audit coverage is thin.** Price changes, plan edits, user creation, role permission changes,
    refunds, and settings changes are not written to `AuditLog`.

### Low / noted as correct

- No secret is read in client code. Every `process.env` read outside `NEXT_PUBLIC_APP_URL` is in a
  server file. Verified by grep.
- `.env` is git-ignored (`.gitignore:34` matches `.env*`) and `.dockerignore` excludes it from the
  image.
- Passwords are never returned by any endpoint; `system.userByEmail` is only used by `auth.ts` and
  `loginAction`, and neither serialises the row.
- The `next` redirect parameter is validated against `//` and non-`/` prefixes in both `loginAction`
  and the login page.
- API keys are stored as SHA-256 hashes and the secret is shown once — correct handling of a feature
  that is otherwise not wired up.

## 13. Docker

No Docker daemon was available, so this section is a code review plus a native run of the equivalent
stack on the documented ports.

### What the configuration says

| Expectation from the brief | Configuration | Verdict |
| --- | --- | --- |
| Next.js on `3017` | `"${APP_PORT:-3017}:3000"` in both compose files; `package.json` `dev`/`start` use `--port ${APP_PORT:-3017}` | Correct |
| MySQL on `3317` | `"${MYSQL_PORT:-3317}:3306"` in both compose files | Correct |
| App at `http://localhost:3017` | `AUTH_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` all set to `http://localhost:${APP_PORT:-3017}` | Correct |
| Internal traffic to `mysql:3306`, not `localhost:3317` | `DATABASE_URL: mysql://…@mysql:3306/…`; service `hostname: mysql`; `MYSQL_HOST: mysql`, `MYSQL_PORT: "3306"` | Correct |
| Ports changeable via `.env` | `APP_PORT` and `MYSQL_PORT` are read from `.env` by both compose files and by `npm run docker:check` | Correct |

The rest of the dev setup is sound: MySQL 8.4 with a named volume `subscription_platform_mysql_data`
that survives `docker compose down`, a `mysqladmin ping` healthcheck with a 25-second start period and
30 retries, `depends_on … condition: service_healthy`, a dedicated bridge network, a bind mount of
the source with anonymous volumes shadowing `node_modules` and `.next` so hot reload works without a
rebuild, and an entrypoint that waits for the database with a real connection attempt (60 × 2 s)
before running `prisma generate`, `migrate deploy`, and the seed.

`scripts/docker-check.mjs` is a nice touch — it parses `.env.example` and `.env`, validates both port
numbers, tries to bind each, and tells the operator to change `.env` rather than the source.

I confirmed the application side independently: MariaDB bound to `3317`, `DATABASE_URL` pointed at
`127.0.0.1:3317`, `prisma migrate deploy` applied the init migration, the seed ran, and the app served
on `3017`.

### Problems

1. **The production image seeds demo data.** `Dockerfile` runner: `CMD ["sh", "scripts/docker-entrypoint.sh", "node", "server.js"]`,
   and that script's last step before `exec "$@"` is `npx tsx prisma/seed.ts`. See security finding 5.
   The seed is idempotent (it exits if `admin@boxs.demo` exists), which makes it harmless on restart
   and dangerous on first boot.
2. **The production image runs `prisma generate` and `tsx` at container start.** Both require
   devDependencies, which is why the runner stage copies all of `node_modules` from the builder
   rather than a production-only tree. The standalone output exists precisely to avoid that; the
   image is much larger than it needs to be and the client is regenerated on every boot.
3. **Compose hardcodes the database credentials, ignoring `.env`.** Both files set
   `DATABASE_URL: mysql://subscription_user:subscription_pass@mysql:3306/subscription_db` literally,
   while the MySQL service reads `${MYSQL_USER:-…}`, `${MYSQL_PASSWORD:-…}`, and
   `${MYSQL_DATABASE:-…}` from `.env`. An operator who changes `MYSQL_PASSWORD` in `.env` — the
   obvious first hardening step — gets a database with the new password and an app still presenting
   the old one. The healthcheck has the same literals baked in.
4. **No healthcheck on the app container** in either file, so Compose has no signal that Next.js came
   up. `GET /api/v1/health` exists and returns `{"success":true,"data":{"ok":true}}` — it is simply
   not wired to a `healthcheck:` block.
5. **`public/uploads` is not a volume.** Media uploads are written into the image's filesystem. They
   are lost on every `docker compose up --build` and are not shared between replicas.
6. **No resource limits, no `restart` policy on the dev app container**, and no non-root `USER` in
   the runner stage.

## 14. Mobile-first review

Assessed by reading the markup and the Tailwind classes; the responsive behaviour below follows
directly from the breakpoints in the source. A 390 px pass in a real browser is still worth doing
for the admin, which is the weakest area.

**Good:**

- Interactive targets are consistently `h-11` (44 px) or `h-12` (48 px) across the wizard, account
  forms, admin forms, and buttons. That meets the 44 px guidance almost everywhere.
- The storefront grids are mobile-first: `grid gap-4 md:grid-cols-2 xl:grid-cols-3` on plan cards,
  `md:grid-cols-[1.2fr_0.8fr]` on the hero, `flex-col sm:flex-row` on the hero buttons.
- Every wide table is wrapped in `overflow-x-auto` with an explicit `min-w` — the plan comparison
  table (`min-w-[720px]`) and the admin record browser (`min-w-[640px]`).
- Horizontal chip rows (category filters, account tabs, dashboard range selector, wizard step
  indicator) all use `overflow-x-auto` rather than wrapping or clipping.
- The mobile drawer in `src/components/site/header-drawer.tsx` is properly built: portalled to
  `document.body`, `aria-expanded` on the trigger, Escape to close, body scroll locked while open,
  auto-close on resize past `lg`, backdrop button with an accessible label, and `max-w-[80vw]`.
- The wizard's price panel is `lg:sticky lg:top-24` on desktop and stacks below the form on mobile,
  which is the right order.

**Problems:**

- **The admin sidebar becomes a 28-item horizontal scroll strip on mobile.** `md:grid-cols-[240px_1fr]`
  means that below `md` the `<aside>` sits above the content and its `<nav>` is
  `flex gap-2 overflow-x-auto`. Reaching "Settings" or "Audit logs" means scrolling a one-line strip
  through 25 other links. This is the worst mobile interaction in the product.
- **The banner is an unsized full-width `<img>`** (`src/components/site/chrome.tsx`) with no
  `width`/`height` and no `aspect-ratio`, so it causes cumulative layout shift on every page load,
  worst on mobile.
- The admin record-browser table at `min-w-[640px]` inside a 390 px viewport means roughly 40 % of
  every row is off-screen, including the Select checkbox and the Edit link, which sit in the last
  column.
- The wizard's address step renders five stacked inputs with `capitalize`d field names derived from
  the object keys — the labels read "Label", "Line1", "City", "Region", "Postalcode". "Line1" and
  "Postalcode" are not words.
- The admin dashboard's metric grid is `grid-cols-2` at mobile with `text-2xl` values; longer
  formatted amounts such as `₱1,234,567.00` will wrap inside the card.
- The wizard progress bar lists nine steps as scrollable chips with no indication that more exist off
  the right edge.

## 15. Performance

Measured and read, not guessed.

**The whole app is dynamic.** `src/app/layout.tsx` declares `export const dynamic = "force-dynamic"`
at the root. The production build confirms the effect: of 20 routes, 18 are `ƒ (Dynamic)` and only
`/robots.txt` and `/sitemap.xml` are static. The home page, the plans index, and every plan detail
page — all of which are catalogue content that changes when an admin publishes, not per request — are
re-rendered and re-queried on every hit. There is no `revalidate`, no `unstable_cache`, no `fetch`
cache usage, and no `revalidateTag`/`revalidatePath` anywhere in the codebase.

**Every page pays for the public layout.** `src/app/(public)/layout.tsx` is `async` and awaits
`system.menus()` and `system.settings()` on every request, for two values: the business name and two
short link lists. That is two queries per page view that could be cached indefinitely and invalidated
on save.

**Query patterns.** No N+1 was found in the hot paths — the repositories use `include` consistently
and `Promise.all` for parallel counts. Two places do more work than needed:

- `system.overview` (the admin dashboard) issues 11 parallel aggregate queries, then a `groupBy`, then
  a plan-name lookup, then buckets payments in JavaScript — and it also selects every captured
  `Payment` in the range in order to build the daily series client-side. Over a year's range on a
  real dataset that is a large result set transferred to compute a sum per day that MySQL could do.
- `catalogAddons` in `checkout-service.ts` fetches up to 100 add-ons and then filters in memory by id
  (`page.items.filter(a => ids.includes(a.id))`), instead of querying `where: { id: { in: ids } }`.
  It also uses a dynamic `await import("@/repositories/catalog")` inside the function, apparently to
  break an import cycle.
- `MenuPage` fetches 50 products and 20 categories and does the grouping with a nested `filter` in
  the render — O(categories × products) and correct, but it will not scale past a demo catalogue.

**Pagination** is capped at `pageSize: 100` by `helpers.paging`, which is good, but the exports
endpoint relies on that same cap and so silently truncates (§9).

**Images.** `/logo_main.png` and `/banner.jpg` are raw `<img>` tags — the only two ESLint warnings in
the project. No `next/image`, so no responsive `srcset`, no automatic format negotiation, no
intrinsic sizing. `public/banner.jpg` is served at full width on every page.

**Fonts** are handled correctly: `next/font/google` for Outfit and Fraunces with CSS variables, so
they are self-hosted and preloaded.

**Client bundle.** Only nine components are `"use client"`, and the heavy ones are appropriately
scoped. `recharts` is pulled in by `RevenueChart`, which is only rendered on the admin dashboard, but
it is a static import rather than `next/dynamic`, so it lands in the admin chunk whether or not the
chart is in view. `@tanstack/react-query` is instantiated in the root `Providers` for every page
although only the subscribe wizard uses it.

## 16. Testing

`npm test` → **29 tests, 8 files, all passing, 577 ms.**

| File | Tests | Covers |
| --- | --- | --- |
| `modules/pricing/pricing-service.test.ts` | 4 | base + variant + add-ons, tax, percent coupon, clamping |
| `modules/subscriptions/engine.test.ts` | 11 | pause, resume, skip, cancel, cutoffs, min commitment, proration, renew paid/unpaid |
| `modules/coupons/coupon-service.test.ts` | 4 | expiry, minimum, per-customer limit, new-customer scope |
| `modules/delivery/availability.test.ts` | 3 | wrong day, capacity, cutoff |
| `modules/plans/selection.test.ts` | 2 | required group, unknown option |
| `modules/orders/snapshot.test.ts` | 1 | snapshot shape |
| `modules/webhooks/processor.test.ts` | 2 | signature verification, duplicate suppression |
| `modules/auth/permissions.test.ts` | 2 | `can()` and role presets |

Everything tested is a pure function in `src/modules`. That is a sensible place to start and the
coverage of the decision logic is decent.

**Nothing else is tested at all.** There are no tests for:

- **Any repository.** `persistCheckout` — the single most important function in the system, which
  writes a subscription, an order, items, a snapshot, a payment, a transaction, a delivery assignment,
  a coupon redemption, and a notification in one transaction — has zero coverage.
- **Any API route.** No test issues an HTTP request. Every authorization bug in §11 would have been
  caught by one test per endpoint asserting the status code for an anonymous caller, a customer, and
  an admin. That is the highest-value missing test suite in the project.
- **Checkout end to end.** Quote → availability → address → payment → persist is only exercised
  incidentally by `prisma/seed.ts`.
- **Coupon redemption recording**, as opposed to coupon evaluation.
- **Plan save/publish/versioning.** The items-and-variants data loss (§3) is a one-line assertion
  away from being caught.
- **Renewal as a whole** — the engine's `renewSubscription` is tested; the service that calls the
  payment provider and persists nothing is not.
- **Docker.** No test starts the stack, applies migrations, or hits `/api/v1/health`.
- **Any React component.** No `jsdom` environment is configured (`vitest.config.ts` sets
  `environment: "node"` and `include: ["src/**/*.test.ts"]`, which excludes `.tsx` by construction).
- **Pricing with a delivery fee and a coupon together** — precisely the combination that exposes the
  double-calculation bug in §7.

Named in priority order, the missing critical tests are: API authorization matrix; `persistCheckout`
transaction; plan save preserving items and variants; pricing with delivery + tax + coupon together;
renewal creating a payment and an order; subscription action ownership.

## 17. Hard-coded business rules

The plan model genuinely moves most rules into data. These are the ones still in code.

**Should be configurable, currently are not:**

| Value | Location | Note |
| --- | --- | --- |
| `cancellationCutoffHours: 24`, `changeCutoffHours: 24`, `skipCutoffHours: 24`, `deliveryChangeCutoffHours: 24` | `DEFAULT_RULES` in `engine.ts`, repeated as Prisma `@default(24)` | Per-plan overrides exist in the DB; only the cancellation one is editable in the UI. A `subscription.default_cutoff_hours` setting exists in the seed and nothing reads it. |
| Skip advances by exactly 1 day | `engine.ts` `skipDelivery` | Should follow the plan interval or the zone schedule |
| `durationDays` → month = 30 days, week = 7 days | `engine.ts` `durationDays`, `checkout-service.ts` `resolveTerm`, `plans/preview.ts` | Three copies of the same approximation |
| Upcoming-deliveries window of 7 days | `system.overview` | Dashboard metric |
| Dashboard ranges `today/7d/30d/90d/year` | `server/api.ts` `range()` **and** `dashboard.tsx` `fromRange()` | Duplicated |
| Export cap of 100 rows | `server/api.ts` | Silently truncates |
| Page size cap of 100 | `helpers.paging` | Reasonable default, not configurable |
| bcrypt cost 12 | `server/api.ts` ×2, `prisma/seed.ts` | Fine, but three literals |
| Rate limits 5/min and 10/min | `server/api.ts`, `auth.ts` | |
| Upload limit 8 MB, `image/*` only | `media/upload/route.ts` | |
| Notification channel fallback `["IN_APP"]` | `system.notify` | |
| Default temporary password `ChangeMe123!` | `server/api.ts` users POST | A user created without a password gets a known password |

**Davao-specific values hard-coded in UI components** — these are presentation defaults, but they are
business data sitting in React:

| Value | Location |
| --- | --- |
| `city: "Davao City"`, `region: "Davao del Sur"`, `postalCode: "8000"` | `subscribe-wizard.tsx` initial address state |
| Same three as `defaultValue` | `account-forms.tsx` `AddressForm` |
| Same, plus fee `200`, window `06:00`–`09:00`, cutoff `20:00`, max orders `40`, default day Monday | `module-forms.tsx` `ZoneForm` |
| Delivery date defaults to today + 3 days | `subscribe-wizard.tsx` |
| `"Davao City · Prices in Philippine peso. Demo catalog."` | `chrome.tsx` footer |
| `"Davao City · Subscription platform"` | home page hero |
| Currency locale `en-PH` | `lib/money.ts` |
| Timezone `Asia/Manila` | `account/page.tsx`, `record-browser.tsx` |
| Default base price ₱2,500 and delivery fee ₱200 | `plan-builder.tsx` initial form state |
| Hex colours `#1f6b56`, `#1c1915`, `#f6f1e7`, `#f3eee4` | Literals in ~20 places across admin and storefront, alongside the CSS-variable theme |

`business.city`, `business.currency`, and `business.timezone` all exist as `Setting` rows. Only
`business.name` is ever read (by the public layout). The other three are editable in the admin and
have no effect.

## 18. Admin usability

Judged as a business employee with no programming background.

| Task | Can they? | What gets in the way |
| --- | --- | --- |
| Create a simple plan | Yes | Clear form, pesos not centavos, help text on most fields, Save draft / Publish split |
| Change a plan's price | Yes, but | Editing deletes the plan's included products and variants without warning (§3) |
| Create a plan variant | **No** | No UI at all |
| Set which option is preselected | **No** | No UI; new options are always non-default |
| Set how many deliveries an option includes | **No** | No UI; `deliveryCount` is seed-only |
| Create a coupon | Yes | Form is clear. "10 for 10%, or 50 for ₱50 off" in one field is a trap, and there is no min-spend, max-uses, or per-customer-limit input |
| Change subscription rules | Partly | Four toggles and cancellation cutoff; the other three cutoffs and the minimum commitment are not exposed |
| Pause or cancel a customer's subscription | **No** | The subscriptions list has no row link and there is no detail screen |
| Change a customer's plan | **No** | API-only |
| Manage a customer | Barely | List, search, suspend/activate in bulk. No detail view, no notes, no address or payment-method management |
| Manage an order | Yes | Detail view with six status buttons, items, and delivery |
| Refund a payment | **No** | Endpoint exists; no button |
| Manage delivery | Partly | Can create a zone with one schedule row; cannot add a second window, edit a window, or change a delivery's status directly |
| Edit content | Yes | Pages, FAQs, and menus all have working forms |
| Upload media | Yes | Works, with alt text |
| Manage users and roles | Yes | Create user with role; custom roles with permission checkboxes and plain-language labels |
| Change settings | Yes | Grouped, with help text — but three of the eight settings do nothing (§17) |
| Read the audit log | Yes | Though only four action types are ever written |

Patterns that hurt across the whole admin:

- **Create but not update.** Every `ModuleForms` form is an "Add" form. There is no edit for a
  category, add-on, product, coupon, zone, FAQ, page, or user. To change a coupon's expiry you would
  create a second coupon.
- **No delete in the UI** for anything except via plan bulk actions.
- **No pagination control.** Lists render whatever the first page returns, and there is no page
  indicator, no total count, and no next/previous.
- **No sorting or filtering** beyond the single search box. No status filter on orders or
  subscriptions, which is the first thing a support person would want.
- **The create form sits below the table**, so on a module with many rows the administrator has to
  scroll past the whole list to add a record.
- **Bulk actions appear only after selection** and exist only for plans, orders, and customers.
- **No empty-state guidance.** Every empty module shows "Nothing here yet." with no next step.
- **No confirmation** on destructive bulk actions (archive, suspend, delete).
- "Content" and "Pages" are two sidebar entries pointing at the same `/admin/content` route.

## 19. Duplication

| Duplicated | Where | Severity |
| --- | --- | --- |
| Coupon amount calculation | `evaluateCoupon` (unused result) vs `calculatePrice` — different bases, different answers | **Real bug**, §7 |
| Dashboard date ranges | `range()` in `server/api.ts` and `fromRange()` in `dashboard.tsx` | Will drift |
| Default option selection | Same `group.options.find(o => o.isDefault) ?? group.options[0]` expression in `plans/[slug]/page.tsx`, `checkout/page.tsx`, `subscribe-wizard.tsx`, and `plans/preview.ts` | Four copies |
| Interval → days conversion | `durationDays()` in `engine.ts`, inline in `resolveTerm`, inline in `previewPlan`, inline again in `persistCheckout` | Four copies of 7/30 |
| Period-end calculation | `addInterval()` in `engine.ts` and a hand-written `if (unit === "DAY") … WEEK … MONTH` block in `persistCheckout` | Two copies |
| `SubscriptionRules` type | Declared in both `src/modules/subscriptions/engine.ts` and `src/types/domain.ts`, aliased as `Rules` in `repositories/plans.ts` | Structurally identical |
| Subscription status / interval / billing-mode unions | Hand-written in `engine.ts`, in `domain.ts`, in `billing.ts` DTOs, and generated by Prisma | Four declarations |
| `postJson` helper | `module-forms.tsx`; `record-browser.tsx`, `plan-builder.tsx`, `subscribe-wizard.tsx`, `subscription-actions.tsx`, and `account-forms.tsx` each hand-roll the same `fetch` + `json` + `success` check | Six near-copies |
| Peso↔centavo conversion in forms | `Math.round(Number(x) * 100)` inline in `plan-builder.tsx` (×4) and `module-forms.tsx` (×3) while `pesosToCents` exists in `lib/money.ts` | Seven copies of a function that exists |
| Checkout wizard mount | `/plans/[slug]` and `/checkout?plan=` both build `optionIds`, fetch zones and add-ons, call `quoteSubscription`, and render `SubscribeWizard` with nearly identical code | Two entry points, one wizard |
| `can(...)` permission checks | ~40 hand-written call sites in `server/api.ts` | The mechanism that allows §11's omissions |
| Hex colour literals | `#1f6b56` and friends inline in ~20 components despite a CSS-variable theme | Cosmetic |

## 20. Dead and unreachable code

Documented, not deleted, per the audit brief.

**Unreachable or unused code:**

| Item | Evidence |
| --- | --- |
| `completeIfFinished` in `engine.ts` | Exported, never imported. The only path to `COMPLETED` status. |
| `plans.setStatus` in `repositories/plans.ts` | Exported, never called. |
| `system.contacts()` | Exported, never called. There is no admin screen for contact messages. |
| `hashApiKey` in `payments/builtin-providers.ts` | Exported from a payments module, never called. `system.createApiKey` does its own `createHash`. |
| `listPaymentProviders()` in `payments/provider.ts` | Exported, never called. The wizard hard-codes the three provider options instead. |
| Provider methods `authorizePayment`, `capturePayment`, `refundPayment`, `getPaymentStatus`, `cancelRecurringPayment` | Implemented on all three built-in providers and never invoked. The refund endpoint updates the database directly without calling `refundPayment`. |
| The entire API-key authentication scheme | Keys are created, hashed, listed, and revoked. Nothing authenticates with them. `ApiKey.lastUsedAt` is never written. |
| `id ? await system.templates() : …` in the `notifications` GET branch | The branch is guarded by `!id`, so the true arm is unreachable. |
| `evaluateCoupon`'s returned `amountCents` | Computed, returned, and discarded by the only caller. |
| `PlanVersion.snapshot` | Written at publish, never read. |
| `void home; void addons; void liza;` in `prisma/seed.ts` | Explicit discards of bound values. |

**Schema fields that no code reads or writes:**

`Subscription.resumeAt`, `Subscription.completedAt`, `Subscription.paymentMethodId` (the whole
`PaymentMethod` model is created by the schema and never populated), `Plan.imageUrl`,
`Product.imageUrl`, `Addon.imageUrl`, `Coupon.automatic`, `Category.parentId` (the self-relation
exists; no UI or API sets it), `MenuItem.parentId` (same), `ProductVariant.attributes`,
`CustomerProfile.notes`, `CustomerProfile.marketingOptIn` (set once by the seed, never read),
`ContactMessage.readAt`, `Media.caption` (written, never displayed), `PaymentTransaction.idempotencyKey`,
`Payment.failureReason`, `AuditLog.ip` (the parameter exists on `writeAudit`; no caller passes it),
`SubscriptionItem.quantity` (always 1), `User.lastLoginAt` (written at login, never displayed).

**Enum values never produced:** `UserStatus.INVITED`, `SubscriptionStatus.SUSPENDED`,
`SubscriptionStatus.EXPIRED`, `SubscriptionStatus.COMPLETED`, `PaymentStatus.AUTHORIZED`,
`PaymentStatus.CANCELLED`, `OrderStatus.READY`/`OUT_FOR_DELIVERY` (reachable only through the order
detail buttons), `FeaturedLabel.LIMITED`, `CouponScope.FIRST_SUBSCRIPTION` (distinguishable from
`NEW_CUSTOMER` in `evaluateCoupon` but both are fed the same `priorOrders === 0` value by
`quoteSubscription`, so they behave identically), `NotificationChannel.PUSH`/`SMS`.

**Environment variables read by nothing:** `PAYMENT_PROVIDER`, `EMAIL_PROVIDER`, `EMAIL_API_KEY`,
`SMS_PROVIDER`, `SMS_API_KEY`. `PAYMENT_SECRET` is read only by the webhook branch.

**Assets:** `asset/logo.jpg`, `asset/banner.jpg`, `asset/logo_main.png` duplicate
`public/banner.jpg` and `public/logo_main.png`; only the `public/` copies are served.
`public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` are `create-next-app` leftovers.

**Documentation drift:** `DATABASE.md` lists a table called `PageBlock`; the model is `ContentBlock`.
`docs/local-run.doc` is a `.doc`-named copy of `docs/local-run.md`.

## 21. Issue register

### P0 — critical

| # | Issue | Evidence |
| --- | --- | --- |
| P0-1 | Any signed-in user can export every customer, order, and subscription as CSV (`GET /api/v1/exports/:kind` only checks `requireUser`) | Customer session returned the full customer CSV |
| P0-2 | `GET /api/v1/orders/:id` has no authentication whatsoever; returns the full order and delivery address | Anonymous `curl` returned `BX-10001` |
| P0-3 | Any signed-in user can soft-delete any address by id | Paolo's session set `deletedAt` on Liza's address |
| P0-4 | A customer can self-renew repeatedly, extending the paid period with no `Payment` and no `Order` recorded | 4 calls → `periodEnd` +4 weeks, payment count stayed 1 |
| P0-5 | Renewal takes money through the provider and persists no payment, order, or delivery — revenue is invisible to reports | `SB-10002` renewed; `Payment` count 1, `Order` count 1 |
| P0-6 | Production containers seed a `super-admin` with the publicly published password `DemoAdmin123!` | `docker-entrypoint.sh` + prod `Dockerfile` CMD + `README.md` |
| P0-7 | `.env.example` ships `AUTH_SECRET=replace-with-a-long-random-string`; nothing fails if it is left as-is | `.env.example`, `auth.ts` |

### P1 — high

| # | Issue | Evidence |
| --- | --- | --- |
| P1-1 | Saving a plan from the Plan Builder silently deletes all `PlanItem` and `PlanVariant` rows | items 1→0, variants 1→0 after a builder-shaped PATCH |
| P1-2 | Plan edits orphan `SubscriptionItem.refId` and `PlanVariant.optionIds`, breaking re-quote and plan change for existing subscriptions | 1 orphaned subscription item after one edit |
| P1-3 | Editing a published plan does not bump `currentVersion` or write a `PlanVersion`, so version snapshots no longer describe what was sold | Plan at ₱2,800, v1 snapshot at ₱2,500, `currentVersion` still 1 |
| P1-4 | Percentage coupons are applied to a different base than the one the eligibility check uses — delivery and tax get discounted | `WELCOME10`: `evaluateCoupon` computes ₱170, customer receives ₱190 |
| P1-5 | Nothing renews on a schedule; `nextBillingAt` is written and never read; no cron, queue, or worker exists | grep across `src` |
| P1-6 | Pause does not extend the term; a paused fixed-duration customer loses the paused days | `periodEnd` unchanged across pause/resume |
| P1-7 | Skip advances by exactly one calendar day regardless of interval or zone schedule, and never decrements `remainingDeliveries` | 2026-10-06 → 2026-10-07, remaining stayed 3 |
| P1-8 | Only the first delivery of a program is ever created; deliveries 2..n have no `DeliveryAssignment` and no order | 3-delivery subscription has one `DeliveryAssignment` |
| P1-9 | Webhooks verify and store events, then do nothing — async captures and failed charges are never reconciled | `processWebhook` has no side effect beyond `store.save` |
| P1-10 | Stored XSS: plan name escapes the JSON-LD `<script>` block on every public plan page | Served HTML contained the injected `<script>` |
| P1-11 | `GET /api/v1/search` exposes other customers' names and emails to any signed-in user | Customer session resolved `liza@boxs.demo` |
| P1-12 | `SUSPENDED`, `EXPIRED`, and `COMPLETED` are unreachable; `completeIfFinished` is never called | grep; lifecycle test |
| P1-13 | No password reset exists | No route, no token model, no mail transport |
| P1-14 | `GET /api/v1/coupons` returns every coupon code and value to anonymous callers | Anonymous `curl` |
| P1-15 | No admin subscription detail screen; admins cannot pause, cancel, or change a subscription from the UI | `RecordBrowser` renders row links only for plans and orders |
| P1-16 | No API-level tests, so every authorization defect above was undetectable by CI | `vitest.config.ts` includes only `src/**/*.test.ts`, all pure-function |

### P2 — medium

| # | Issue |
| --- | --- |
| P2-1 | No validation layer; `zod` is a dependency and is imported nowhere |
| P2-2 | `GET /settings`, `/roles`, `/permissions`, `/feature-flags` are anonymous-readable |
| P2-3 | Compose hardcodes database credentials, so changing `MYSQL_PASSWORD` in `.env` breaks the app |
| P2-4 | Production image runs `prisma generate` + `tsx` at boot and ships devDependencies |
| P2-5 | No healthcheck on the app container although `/api/v1/health` exists |
| P2-6 | `public/uploads` is not a volume; media is lost on rebuild |
| P2-7 | The seed marks two `PlanOption` rows in one group as `isDefault`, so the storefront "From" price is not the plan's intended default |
| P2-8 | `GET /exports/:kind` silently truncates at 100 rows |
| P2-9 | Admin has create forms but no edit or delete for most modules |
| P2-10 | Admin lists have no pagination, sorting, or status filters |
| P2-11 | Root `force-dynamic` disables all static generation and caching |
| P2-12 | Admin sidebar is a 28-item horizontal scroll strip on mobile |
| P2-13 | SVG uploads are accepted and served same-origin |
| P2-14 | Webhook secret falls back to `""`, making signature verification bypassable when unset |
| P2-15 | `change_address` does not verify the address belongs to the subscription's customer |
| P2-16 | `change_delivery_date` does not validate the new date against the zone schedule |
| P2-17 | `nextNumber` sequence generation can collide under concurrent checkout |
| P2-18 | Rate limiting is in-process, applied only to login and register |
| P2-19 | No CSRF token or origin check on the custom API |
| P2-20 | Demo credentials rendered on the public login page |
| P2-21 | `tax.rate_bps`, `business.city`, `business.currency`, `business.timezone` settings are editable and inert |
| P2-22 | Audit log covers only 4 action types; price changes and role changes are not recorded |
| P2-23 | API keys can be created but authenticate nothing |
| P2-24 | Email and SMS templates can be enabled but nothing sends |
| P2-25 | Refund endpoint never calls the provider's `refundPayment` |
| P2-26 | No index supports any of the `contains` search queries |
| P2-27 | `system.overview` loads every captured payment in range to bucket them in JavaScript |
| P2-28 | Davao-specific defaults and the brand palette are hard-coded in React components |
| P2-29 | Banner `<img>` has no dimensions; guaranteed layout shift |
| P2-30 | `docs/openapi.yaml` documents 5 of ~60 endpoints |

### P3 — low

| # | Issue |
| --- | --- |
| P3-1 | `equivalentPrices` compounds rounding into the weekly and monthly figures |
| P3-2 | Wizard address labels read "Line1" and "Postalcode" |
| P3-3 | "Content" and "Pages" sidebar entries point at the same route |
| P3-4 | `asset/` duplicates `public/`; `create-next-app` SVGs remain |
| P3-5 | `DATABASE.md` names a table `PageBlock` that is called `ContentBlock` |
| P3-6 | Six hand-rolled copies of the same `fetch` wrapper; `pesosToCents` exists but is bypassed seven times |
| P3-7 | `recharts` and `react-query` are statically imported for every route that loads their chunk |
| P3-8 | Wizard loses all state if checkout 401s and redirects to login |
| P3-9 | Dead exports and never-written schema fields listed in §20 |

## 22. Fixes applied in this pull request

Scope was deliberately narrow: authorization and data-integrity defects that are small, local, and
carry no architectural risk. Nothing in the Subscription Engine, the pricing formula, the schema, or
the Docker setup was changed. Each fix is listed separately in the pull request body.

1. `GET /api/v1/orders/:id` now requires a session and either `orders.view` or ownership of the order.
2. `GET /api/v1/exports/:kind` now requires the matching view permission per kind instead of any
   session.
3. `DELETE /api/v1/account/addresses/:id` now verifies the address belongs to the caller's customer
   profile.
4. `GET /api/v1/search` now requires `customers.view`, matching the admin search box that is its only
   consumer.
5. `renew` is now restricted to `subscriptions.edit`; customers can no longer self-extend their paid
   period. No UI called it.
6. `GET /api/v1/coupons`, `/settings`, `/roles`, `/permissions`, `/feature-flags`, and
   `/subscription-types` now require a session and the relevant view permission. All six are consumed
   only by admin screens.
7. `PATCH /api/v1/plans/:id` now treats an absent `groups`, `items`, or `variants` key as "leave
   unchanged" rather than "delete all", so the Plan Builder no longer destroys a plan's included
   products and variants.
8. The plan JSON-LD block now escapes `<`, `>`, and `&` before interpolation, closing the stored XSS.

A regression test file, `src/server/api-authorization.test.ts`, covers fixes 1–6 at the authorization-
decision level, and `src/repositories/plans.partial-update.test.ts` covers fix 7.

## 23. Decisions that need Ramil

1. **Renewal.** Nothing renews on a schedule, and when renewal is triggered manually it records no
   money. Fixing this is the single largest piece of remaining work and it needs a direction: an
   in-app scheduled route hit by an external cron, a worker process, or a hosted scheduler. It also
   needs a decision on whether each renewal creates a new `Order` and `DeliveryAssignment` (the
   schema is shaped for it) or only a `Payment`.
2. **Deliveries after the first one.** A 7-day program currently produces one delivery record. Should
   checkout materialise all N `DeliveryAssignment` rows up front, or should a scheduler generate the
   next one as each is completed? This interacts with pause, skip, and cancel.
3. **Pause semantics.** Should pausing a fixed-duration program extend `periodEnd` by the paused
   duration, or should the customer forfeit those days? The code currently forfeits silently.
4. **Coupon base.** Should a percentage coupon apply to the plan subtotal only, or to the subtotal
   including delivery and tax? The code does the latter and the eligibility check assumes the former.
   Changing it moves real money, so it is yours to call rather than mine.
5. **Plan versioning.** Make editing a published plan bump the version automatically, or require the
   administrator to press Publish to create a new version and keep edits as a pending draft? The
   second is closer to WordPress and more work.
6. **Production seeding.** The demo seed must come out of the production entrypoint. Options: an
   `ENABLE_DEMO_SEED` flag, a separate `docker-entrypoint.dev.sh`, or dropping the seed from the
   runner stage entirely. Related: whether the demo credentials stay on the login page.
7. **API keys.** Either implement bearer-token authentication against `ApiKey.keyHash` or remove the
   admin section, since it currently issues credentials that do nothing.
8. **Email and SMS.** `EMAIL_PROVIDER` and `SMS_PROVIDER` are configured and unread. Decide whether
   notifications stay in-app only until a provider is chosen, and hide the other channels in the admin
   until then.
