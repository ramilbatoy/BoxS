---
name: subscription
description: How BoxS is built and the rules any change to it must follow. Use this whenever you touch subscriptions, plans, pricing, checkout, orders, payments, deliveries, coupons, the admin, the v1 API, the Prisma schema, or the Docker setup — and before adding any new module such as loyalty, referrals, gift cards, affiliates, reviews, rewards, wallet, credits, memberships, appointments, digital subscriptions, physical products, or service subscriptions.
---

# BoxS subscription platform

This skill describes the system as it actually is, verified by reading the code and running it. Where
behaviour is known to be wrong or missing, it says so rather than describing the intent. Treat the
"Known gaps" notes as constraints you must design around, not as a backlog you should fix in passing.

Deeper detail lives in [`docs/SUBSCRIPTION_SYSTEM_AUDIT.md`](../../../docs/SUBSCRIPTION_SYSTEM_AUDIT.md)
and [`docs/SUBSCRIPTION_FUNCTIONALITY_MATRIX.md`](../../../docs/SUBSCRIPTION_FUNCTIONALITY_MATRIX.md).

## Project purpose

BoxS is a modular, API-first subscription platform. It was designed first for meal subscription and
delivery in Davao City, and it is architected to run multiple subscription business models from the
same engine. The seed data proves the point: alongside four meal plans it ships `Studio Membership`
(a monthly access membership) and `Home Reset` (a weekly service visit), both running through the
same plan, pricing, subscription, order, and delivery tables as the meals.

Meals are the demo catalogue. Nothing in the schema or the engine is meal-specific, and nothing new
should be.

## Stack

Next.js 16 App Router · React 19 · TypeScript (strict) · Tailwind 4 · shadcn/ui (`base-nova`, neutral,
CSS variables) · Auth.js v5 credentials with JWT sessions · Prisma 7 with `@prisma/adapter-mariadb`
· MySQL 8.4 · Vitest · Docker Compose. Money is integer centavos everywhere. Currency is PHP and
money is formatted with `Intl.NumberFormat("en-PH")` in `src/lib/money.ts`.

## Architecture

```text
src/app          routes: (public) storefront, /admin, /api/v1 catch-all, /api/auth
src/components   ui/ (shadcn), site/ (chrome, drawer), store/ (wizard),
                 admin/ (dashboard, plan builder, record browser, forms), account/
src/modules      business rules — no Prisma imports, pure and unit-tested
src/repositories the only Prisma consumers
src/server       api.ts — the whole HTTP API
src/database     client.ts — Prisma singleton
src/lib          money, csv, slug, errors, rate-limit, utils
src/types        domain DTOs, next-auth augmentation
prisma           schema.prisma (40 models), migrations/, seed.ts
```

There is no `src/services`, no `src/validators`, and no `src/config`. `src/modules` is the service
layer. Tests are colocated as `*.test.ts` next to the code they cover.

### The two data paths

There are two, and you must know which one you are on.

```text
Browser write / client component read:
  client component → fetch /api/v1/... → handleApi() → module service → repository → Prisma → MySQL

Server component read:
  server page or layout → repository → Prisma → MySQL
```

Server components read through repositories directly and skip the API. This is deliberate and it is
how every storefront page, the public layout, the account pages, and the admin dashboard work. The
consequence you must respect: **a server component that reads customer-scoped data is responsible for
its own scoping**, because `requirePermission` only runs on the API path. Look at
`src/app/(public)/account/page.tsx`, which passes `userId: session.user.id` into
`billing.subscriptions`, and do the same.

Never let a React component import Prisma, and never let it compute a price. Both rules currently
hold across the whole codebase; keep it that way.

### Modules

| Module | Responsibility |
| --- | --- |
| `modules/pricing` | `calculatePrice` — the one price formula. `equivalentPrices` for per-day/week/month display. |
| `modules/subscriptions` | `engine.ts` is a pure state machine. `subscription-service.ts` adapts it to the database. |
| `modules/checkout` | `quoteSubscription` (price a selection) and `checkout` (persist it). |
| `modules/coupons` | `evaluateCoupon` — eligibility only. |
| `modules/delivery` | `isDeliveryDateAvailable` — day, capacity, cutoff. |
| `modules/orders` | `buildOrderSnapshot` — the immutable record of what was bought. |
| `modules/plans` | `assertPlanSelection` (validity) and `previewPlan` (storefront "from" price). |
| `modules/payments` | `PaymentProvider` interface, registry, and three in-memory demo providers. |
| `modules/webhooks` | HMAC verification and idempotent storage. |
| `modules/auth` | Permission keys and role presets. |

### Repositories

`billing` (customers, addresses, subscriptions, orders, payments, delivery, coupons, checkout
persistence), `catalog` (categories, products, add-ons, subscription types), `plans` (plan CRUD,
publish, versions), `system` (settings, flags, users, roles, content, media, notifications, search,
reports, webhooks, API keys, audit).

### Payments

`PaymentProvider` exposes `createPayment`, `authorizePayment`, `capturePayment`, `refundPayment`,
`getPaymentStatus`, `createRecurringPayment`, `cancelRecurringPayment`. Three demo providers are
registered in `builtin-providers.ts`: `manual` (captures immediately), `cod` (stays pending, activates
the subscription), `bank_transfer` (stays pending). A real provider implements the interface and is
registered there. Only `createPayment` and `createRecurringPayment` are currently called.

### Notifications

`system.notify(userId, templateKey, title, body)` writes `Notification` rows for whichever channels
have an enabled `NotificationTemplate`, defaulting to `IN_APP`. **Nothing sends email or SMS.**
`EMAIL_PROVIDER` and `SMS_PROVIDER` exist in `.env.example` and are read by nothing. Do not promise a
customer an email.

## Core foundations

These three are the highest-priority architecture in the project. Everything else is built on them,
and no new feature may compete with any of them.

### 1. Plan Builder

A plan is data, never code. An administrator must be able to create and change what is sold without a
developer and without a deploy.

### 2. Subscription Engine

One state machine owns the subscription lifecycle. Every status change goes through it and leaves a
`SubscriptionEvent`.

### 3. WordPress-like admin

Every business operation belongs in the admin, in plain language, usable by someone who does not
program.

## Plan Builder rules

### Structure

```text
SubscriptionType  billingMode, intervalUnit, intervalCount, deliveryCount   shared across plans
  └─ Plan         pricing, nine lifecycle rule columns, availability window, status, version
       ├─ PlanOptionGroup   a question: "Duration", "Meals each day", "Serving"
       │    └─ PlanOption   an answer: priceDeltaCents, and optionally durationDays,
       │                    deliveryCount, intervalUnit, intervalCount, billingMode
       ├─ PlanItem          included products and add-ons
       ├─ PlanVariant       a named combination of optionIds with an absolute priceOverrideCents
       └─ PlanVersion       a JSON snapshot written when the plan is published
```

- **An option can change the term, not just the price.** `resolveTerm` in `checkout-service.ts` reads
  `durationDays`, `deliveryCount`, `intervalUnit`, `intervalCount`, and `billingMode` off the selected
  options and falls back to the plan's `SubscriptionType`. This is how one plan offers 3/5/7/14/30-day
  programs and how another switches between weekly and four-weekly renewal.
- **Durations, prices, and rules are rows.** Never add a hard-coded duration, price, or plan to a
  component or a route.
- **Variants are an override, not an addition.** When the selection matches a `PlanVariant` exactly,
  `variantDeltaCents` becomes `priceOverrideCents - plan.basePriceCents`. Otherwise it is the sum of
  the selected options' deltas.
- **Availability** is `startsAt` / `endsAt` on the plan, enforced in `quoteSubscription`.
- **Publishing** is `POST /api/v1/plans/:id/publish` → `publishPlan` → `plans.publish`, which
  increments `currentVersion`, writes a `PlanVersion` snapshot, sets `status = PUBLISHED`, and writes
  an audit log entry.
- **Archiving** is `status = ARCHIVED`; deletion is a soft delete that sets `deletedAt` and archives.
  Plans are never hard-deleted.
- **Only `PUBLISHED` plans can be quoted or bought.** `quoteSubscription` rejects anything else.
  `featuredLabel = HIDDEN` keeps a published plan off the storefront list and detail page.

### Rules for changing the Plan Builder

- Extend this Plan Builder. Do not build a second plan model, a second option system, or a
  feature-specific pricing table.
- A new plan capability is a new column on `Plan` or a new field on `PlanOption`, plus a field in the
  builder form, plus a field in `PlanWrite` and `PlanDTO`. Not a new table unless it is genuinely a
  new entity.
- `plans.save` replaces a child collection **only when the caller sends that key**. An absent
  `groups`, `items`, or `variants` key means "leave unchanged"; an explicit empty array means "clear".
  Preserve that contract — the previous unconditional delete silently destroyed plan data.
- Editing a plan still deletes and recreates its option rows with new ids when `groups` is sent.
  `SubscriptionItem.refId` and `PlanVariant.optionIds` reference those ids and have no foreign key, so
  they go dangling. Do not add new references to `PlanOption.id` without a plan for this.

### Known gaps

The builder UI cannot edit variants, included items, per-option term fields, `isDefault`, three of
the four cutoffs, `minCommitmentDays`, the availability window, `imageUrl`, `currency`, group
`required`, or option ordering and deletion. A published plan can be edited without a version bump,
so `PlanVersion` snapshots drift from what is actually sold. `prisma/seed.ts` marks two options in
one group as `isDefault`, which makes the storefront "from" price use the wrong option.

## Subscription Engine rules

### States

`PENDING` → `ACTIVE` → (`PAUSED` | `PAST_DUE`) → (`CANCELLED` | `COMPLETED` | `EXPIRED` | `SUSPENDED`)

`SUSPENDED`, `EXPIRED`, and `COMPLETED` exist in the enum and nothing writes them today.
`completeIfFinished` is implemented in `engine.ts` and never called. If your feature needs a terminal
state, wire the existing function rather than inventing a status.

### How a transition works

`src/modules/subscriptions/engine.ts` is pure. Every transition has this shape:

```ts
export function pauseSubscription(state: SubscriptionState, now: Date): EngineResult<{ pausedAt: Date }> {
  if (!state.rules.allowPause) return { ok: false, code: "PAUSE_NOT_ALLOWED", message: "…" };
  if (state.status !== "ACTIVE") return { ok: false, code: "INVALID_STATUS", message: "…" };
  return { ok: true, state: { ...state, status: "PAUSED" }, event: "SUBSCRIPTION_PAUSED", message: "Subscription paused" };
}
```

`subscription-service.ts` loads the subscription, maps it to a `SubscriptionState`, calls the engine,
throws an `AppError` on `ok: false`, and persists through `billing.applySubscription`, which updates
the row and writes the `SubscriptionEvent` in one transaction.

**Add a transition by adding a pure function to `engine.ts` and a branch to `actOnSubscription`.**
Never change a subscription row from anywhere else.

### Rules carried on the subscription

`Subscription.rules` is a JSON copy of the plan's nine rule columns, taken at checkout:
`allowPause`, `allowSkip`, `allowCancel`, `allowPlanChange`, `minCommitmentDays`,
`cancellationCutoffHours`, `changeCutoffHours`, `skipCutoffHours`, `deliveryChangeCutoffHours`.
The engine reads `state.rules`, never the live plan — so changing a plan's rules does not change the
terms a customer already agreed to. Keep it that way.

### Actions

`POST /api/v1/subscriptions/:id/actions` with `{ action, ... }`:
`pause`, `resume`, `skip`, `cancel`, `change_plan`, `change_address`, `change_delivery_date`, `renew`.

Authorization: the caller must hold `subscriptions.edit` **or** own the subscription. `renew` is
additionally staff-only, because it advances the paid period and charges the provider. That list is
`STAFF_ONLY_SUBSCRIPTION_ACTIONS` in `src/server/api.ts` — add to it if you add another action that
moves money or time.

### Plan change and proration

`proratePlanChange` credits the unused fraction of the current period
(`currentPriceCents × remaining / total`), charges `max(0, newPrice - credit)` through the provider,
and carries any surplus on `Subscription.creditCents`. It writes a `PLAN_CHANGED` event and an audit
log entry. There is no UI for it yet.

### Payment failure

`renewSubscription(state, now, paid: false)` returns `ok: true` with status `PAST_DUE` and event
`PAYMENT_FAILED`. Nothing retries, dunns, or escalates.

### History

Every transition writes a `SubscriptionEvent` with `type`, `message`, optional JSON `payload`, and
`actorId`. The customer sees the latest 30 on `/account`. Never mutate a subscription without an
event.

### Rules for new features

- Integrate with this engine. Do not create a second subscription table, a second status enum, or a
  parallel lifecycle for your feature's own recurring thing.
- A new recurring product is a new `SubscriptionType` plus a plan, not new code.
- Read `state.rules`, never the live plan, when deciding whether a customer may do something.

### Known gaps

Nothing renews on a schedule — there is no cron, queue, or worker, and `nextBillingAt` is written and
never read. A manual `renew` advances the period but records no `Payment`, no `Order`, and no
`DeliveryAssignment`. Pause does not extend the term. Skip advances exactly one calendar day
regardless of interval or zone schedule and never decrements `remainingDeliveries`. Only the first
delivery of a program is ever created. Webhooks are verified and stored and then have no effect.

## Pricing rules

### The canonical calculation

`calculatePrice` in `src/modules/pricing/pricing-service.ts`. There is exactly one implementation and
every consumer goes through it.

```text
preTax       = base + variantDelta + addons + deliveryFee
tax          = round(preTax × taxRateBps / 10000)
beforeCoupon = preTax + tax − discount
coupon       = clamp(couponAmount(beforeCoupon), 0, beforeCoupon)
total        = max(0, beforeCoupon − coupon)
```

Consumers: `quoteSubscription` (storefront, wizard, `POST /pricing/quote`), `checkout` via the quote,
`previewPlan` (plan cards and the comparison table), `change_plan` via the quote.

**Use this service. Never write a second price calculation.** If your feature changes a price, it
changes an input to `calculatePrice` — a new discount source, a new fee — not the formula in a second
place. If the formula genuinely needs a new term, add it to `PriceInput`, `PriceBreakdown`, and the
`lines` array so every consumer and every receipt picks it up at once.

### Where the price is frozen

- `Order` carries `subtotalCents`, `variantCents`, `addonCents`, `discountCents`, `couponCents`,
  `taxCents`, `deliveryFeeCents`, `totalCents` as its own columns.
- `OrderSnapshot.payload` carries the whole quote plus the plan name, slug, version, selected options,
  add-ons, included products, and the customer's name and email at that moment.
- `Subscription.priceCents` and `Subscription.priceSnapshot` carry the agreed price.
- Renewal uses `current.priceCents` and never re-quotes the plan.

Verified: changing a plan from ₱2,500 to ₱2,800 left the existing order at ₱1,710 and the existing
subscription at ₱1,710.

### Delivery fee

The zone fee wins when a zone is selected; the plan's `deliveryFeeCents` is the fallback. The
storefront preview has no zone, so it shows the plan fee while checkout charges the zone fee.

### Known gaps

`evaluateCoupon` returns an `amountCents` computed from `base + variant + addons`, and that value is
discarded — `calculatePrice` recomputes the coupon from `beforeCoupon`, which includes delivery and
tax. A 10% coupon on a ₱1,900 total takes ₱190, not the ₱170 the eligibility check assumed. The
`tax.rate_bps` setting is inert; tax comes from the plan. `Coupon.automatic` is never read.

## API rules

- **Base path `/api/v1`.** One catch-all route at `src/app/api/v1/[...slug]/route.ts` delegating to
  `handleApi` in `src/server/api.ts`. The one exception is `POST /api/v1/media/upload`, which needs
  multipart.
- **Response envelope, always:**

  ```json
  { "success": true, "data": {} }
  { "success": false, "error": { "code": "PLAN_NOT_FOUND", "message": "The selected plan could not be found." } }
  ```

- **Errors** are `AppError(code, message, status)` from `src/lib/errors.ts`. The message is shown to
  the customer, so write it in plain English with no internal detail. Unknown errors are logged and
  returned as a generic `INTERNAL_ERROR` 500.
- **Authentication** is the Auth.js session, read once per request by `currentUser()`. The JWT carries
  the role slug and the flattened permission keys.
- **Authorization** is `requirePermission(user, "module.action")` for staff endpoints and
  `requireUser(user)` plus an explicit ownership check for customer endpoints. Every new branch needs
  one of the two. There is no middleware and no default-deny, so an omission is invisible — add a case
  to `src/server/api-authorization.test.ts` whenever you add an endpoint.
- **Route matching is positional.** Specific paths must be declared before generic ones:
  `/plans/bulk` and `/plans/slug/:slug` come before `/plans/:id`. Keep new specific routes above the
  generic one.
- **Partial updates:** absent means unchanged, not empty. See the Plan Builder rules.
- **Pagination** is `helpers.paging`, capped at 100 per page.
- **Idempotency** on checkout is the `Idempotency-Key` header, enforced by
  `Order.idempotencyKey @unique` and re-checked inside the transaction.
- **Keep business logic out of the route.** `handleApi` should resolve the caller, check permission,
  and call a module service or a repository. CSV import, bulk status mapping, and refund
  orchestration are currently inline in the route and are the pattern to move away from, not to copy.
- **Document new endpoints** in `API.md`.

### Known gaps

`zod` is a dependency and is imported nowhere. There is no validation layer, no CSRF token, and rate
limiting is a single in-process `Map` applied only to login and register. `docs/openapi.yaml` covers
5 of roughly 60 endpoints.

## Database rules

- **Prisma 7** with the `prisma-client` generator into `src/generated/prisma`, provider `mysql`,
  driver adapter `@prisma/adapter-mariadb`. The datasource URL comes from `prisma7.config.ts`, not
  from the schema.
- **Migrations** live in `prisma/migrations`. Change `prisma/schema.prisma`, then
  `npm run db:migrate` in development and `npm run db:deploy` to apply. Never edit a migration that
  has shipped and never edit the database by hand.
- **Only `src/repositories`, `src/database/client.ts`, and `prisma/seed.ts` may import Prisma.**
- **Money is `Int` centavos** in every column, always suffixed `Cents`. Pesos exist only at the UI
  edge; convert with `pesosToCents` / `centsToPesos` from `src/lib/money.ts`.
- **Naming:** `PascalCase` models, `camelCase` fields, `cuid()` string ids, `createdAt` /`updatedAt`
  on every top-level entity, `deletedAt` for soft delete on catalogue and plan records.
- **Enums over free strings** for anything with a fixed set of values.
- **Index what you filter and sort on.** Follow `Subscription` and `Order`, which index their foreign
  keys, status, and date columns.
- **Transactions:** anything that writes more than one table in one business operation uses
  `prisma.$transaction`. `billing.persistCheckout` is the reference — it writes a subscription,
  order, items, snapshot, payment, transaction, delivery assignment, coupon redemption, and
  notification in one transaction.
- **Historical data is immutable.** Never update `Order` price columns, `OrderSnapshot.payload`,
  `Subscription.priceSnapshot`, `PaymentTransaction`, `CouponRedemption`, or `AuditLog` after they are
  written. A correction is a new row.
- **Backward compatibility:** a schema change must work against the existing data. New columns are
  nullable or have a default. A rename is add, backfill, switch readers, then drop in a later
  migration.

Key relationships to keep in mind: `User 1–1 CustomerProfile`; `CustomerProfile 1–n Address /
Subscription / Order / Payment`; `Plan n–1 SubscriptionType`; `Plan 1–n PlanOptionGroup 1–n
PlanOption`; `Subscription n–1 Plan` and `n–1 PlanVersion`; `Order n–1 Subscription`;
`Order 1–1 OrderSnapshot` and `1–1 DeliveryAssignment`; `Payment 1–n PaymentTransaction`.

### Known gaps

`SubscriptionItem.refId` and `PlanVariant.optionIds` reference `PlanOption` ids with no foreign key.
No constraint stops two options in a group being `isDefault`. The plan option and line-item tables
have no timestamps. Nothing indexes the `contains` search columns. `nextNumber` can collide under
concurrent checkout. `PaymentMethod` is modelled and never populated.

## Admin rules

The target user is a business employee who does not program. Judge every admin change by whether that
person can finish the task without asking a developer.

- **Navigation** is the `links` array in `src/app/admin/layout.tsx`: `[label, href, permission]`,
  filtered by `can()`. Add your module there.
- **CRUD** goes through `RecordBrowser` (`src/components/admin/record-browser.tsx`). Register the
  module in its `modules` map with a title, API path, and column list. Add readable column headings
  to the `headings` map.
- **Forms** go in `ModuleForms` (`src/components/admin/module-forms.tsx`), one component per module,
  rendered below the table.
- **Permissions:** add the key to `PERMISSIONS` in `src/modules/auth/permissions.ts`, add it to the
  role presets that should have it, enforce it on every API branch, and use it in the nav entry.
  Permission descriptions are shown to administrators as checkbox labels, so write them as plain
  statements of what the role may do.
- **Status handling:** show `DRAFT` / `PUBLISHED` / `ARCHIVED` and the subscription and order statuses
  as-is. Soft delete, never hard delete.
- **Search** is the `q` query parameter handled by `helpers.like`. **Filtering** is `status` and
  `categoryId`. **Bulk actions** post `{ ids, action }` to `<module>/bulk`.
- **Help text** on every non-obvious field, as a `hint` on the `Field` component. Prices in pesos, tax
  as a percentage, cutoffs in hours. Never show a raw centavo value or a raw id.
- **UX principles:** plain language over jargon, 44 px minimum touch targets (`h-11` / `h-12`), tables
  wrapped in `overflow-x-auto` with a `min-w`, `sonner` toasts for every success and failure, and an
  empty state that says what to do next.

### Known gaps

Most modules have a create form and no edit or delete. There is no subscription detail screen, so
administrators cannot act on a customer's subscription from the UI. Lists have no pagination control,
sorting, or status filters. The 28-item sidebar collapses to a horizontal scroll strip on mobile.
Refund has an endpoint and no button.

## Docker rules

```bash
cp .env.example .env
docker compose up -d       # http://localhost:3017
```

| Setting | Value |
| --- | --- |
| App, published | `APP_PORT=3017` → container `3000` |
| MySQL, published | `MYSQL_PORT=3317` → container `3306` |
| App URL | `http://localhost:3017` |
| Database from inside Compose | `mysql://subscription_user:subscription_pass@mysql:3306/subscription_db` |
| Database from the host | `mysql://subscription_user:subscription_pass@127.0.0.1:3317/subscription_db` |

**To change a port, edit `APP_PORT` or `MYSQL_PORT` in `.env` and restart. Never edit source to move
a port.** `npm run docker:check` tells you whether both ports are free.

- Internal container traffic uses the service hostname `mysql` on port `3306`. Never `localhost:3317`
  from inside a container.
- Dev compose bind-mounts the source and shadows `node_modules` and `.next` with volumes, so hot
  reload works without a rebuild.
- `scripts/docker-entrypoint.sh` waits for the database, then runs `prisma generate`,
  `prisma migrate deploy`, and the seed.
- `subscription_platform_mysql_data` survives `docker compose down`; `down -v` destroys it.
- Production is `docker compose -f docker-compose.prod.yml up -d --build`.
- Any change you make must still work in Compose. If you add a service or an environment variable,
  add it to both compose files and to `.env.example`.

### Known gaps

The production entrypoint runs the demo seed, which creates `admin@boxs.demo` / `DemoAdmin123!` as
super-admin on a fresh database. `DATABASE_URL` is a hardcoded literal in both compose files, so
changing `MYSQL_USER` or `MYSQL_PASSWORD` in `.env` breaks the app. There is no healthcheck on the app
container although `GET /api/v1/health` exists. `public/uploads` is not a volume.

## Development rules

1. Inspect the existing implementation before writing anything. Most of what you need exists.
2. Read this skill before changing subscriptions, pricing, plans, the admin, the API, the database, or
   Docker.
3. Reuse the existing services. `calculatePrice`, `quoteSubscription`, `actOnSubscription`,
   `evaluateCoupon`, `isDeliveryDateAvailable`, `assertPlanSelection`, `buildOrderSnapshot`.
4. No duplicate business logic. If you are about to write a second version of something, extend the
   first.
5. Follow the module architecture: pure rules in `src/modules`, Prisma only in `src/repositories`,
   HTTP only in `src/server/api.ts`.
6. Use the canonical pricing service for anything that touches money.
7. Use the canonical subscription engine for anything that touches a subscription's state.
8. Keep the architecture API-first. Browser writes go through `/api/v1`. Server-component reads may
   use repositories, and must do their own scoping.
9. Preserve historical transaction data. Orders, snapshots, payments, and redemptions are append-only.
10. Test business-critical logic. A new pure rule gets a unit test; a new endpoint gets an entry in
    `src/server/api-authorization.test.ts`.
11. Maintain Docker compatibility. `docker compose up -d` must still bring the app up on 3017.
12. Maintain mobile-first UX. Design the small screen first; 44 px targets; scrollable tables.
13. Maintain backward compatibility where possible. Existing subscriptions, orders, and plans must
    keep working across your change.

Before you open a pull request: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Do not

- Do not build a second subscription engine, status enum, or lifecycle.
- Do not calculate a price anywhere except `calculatePrice`.
- Do not hard-code plan pricing. Prices are rows.
- Do not hard-code a duration, interval, or cutoff that a plan could own. The existing 7/30-day
  approximations and the 24-hour defaults are already too many; do not add more.
- Do not put business logic in a React component.
- Do not import Prisma from a component, a page, or a module in `src/modules`.
- Do not bypass the API or the service layer from the browser. A server-component read through a
  repository is the one documented exception.
- Do not modify a historical order price, order snapshot, subscription price snapshot, payment
  transaction, coupon redemption, or audit log entry.
- Do not break existing subscription data. A migration must work against rows that already exist.
- Do not split this into microservices. It is a modular monolith on purpose.
- Do not ship fake functionality. If a screen cannot do the thing, do not add the button.
- Do not leave a mock where real behaviour is expected. The in-memory payment providers are the one
  sanctioned placeholder, and they are named as demo providers in the UI.
- Do not remove functionality without checking its dependents. Grep first; document what you find.
- Do not rewrite the architecture because an alternative would be nicer.
- Do not invent a new pattern when a project pattern already works.

## Adding a future module

The same shape works for loyalty, referrals, gift cards, affiliates, reviews, rewards, wallet,
credits, memberships, appointments, digital subscriptions, physical products, and service
subscriptions. Memberships, digital subscriptions, and service subscriptions in particular need **no
new module at all** — they are a `SubscriptionType` plus a plan, which is exactly what
`Studio Membership` and `Home Reset` already are.

For anything that genuinely is new:

1. **Database.** Add models to `prisma/schema.prisma` following the naming, timestamp, soft-delete,
   and centavo conventions. Generate a migration. Relate to `CustomerProfile` for customer-owned data,
   to `Subscription` for subscription-linked data, and to `Order` for transaction-linked data.
2. **Repository.** Add functions to the closest existing repository, or a new file in
   `src/repositories` if the surface is large. Return DTOs with ISO date strings.
3. **Service.** Add a pure module under `src/modules/<feature>` holding the rules. No Prisma.
4. **Pricing.** If it changes what a customer pays, it feeds `calculatePrice` as an input. A loyalty
   discount, a gift-card balance, and a referral credit are all discount sources, not new formulas.
   Add the term to `PriceInput`, `PriceBreakdown`, and `lines` so every receipt shows it.
5. **Subscription lifecycle.** If it reacts to a subscription, add a transition to `engine.ts` and a
   branch in `actOnSubscription`, and write a `SubscriptionEvent`. Do not poll or shadow the state.
6. **API.** Add branches to `handleApi` under `/api/v1/<feature>`, specific routes before generic
   ones, with `requirePermission` or an ownership check on every one. Document them in `API.md`.
7. **Permissions.** Add keys to `PERMISSIONS`, assign them in `ROLE_PRESETS`, and gate the API, the
   nav entry, and the screen.
8. **Admin.** Register the module in `RecordBrowser`, add a form to `ModuleForms`, add the sidebar
   entry with its permission.
9. **Customer surface.** Add to `/account` or the wizard only if the customer genuinely acts on it.
10. **Notifications.** Add a `NotificationTemplate` key and call `system.notify`. In-app only until an
    email or SMS transport exists.
11. **Reports.** Extend `system.overview` if the business would track it on the dashboard.
12. **Audit.** Call `system.writeAudit` for every administrative mutation.
13. **Tests.** Unit tests for the pure rules, an authorization case for each new endpoint.
14. **Update this skill** if the architecture changed.

Worked example — referrals: a `Referral` model (referrer `CustomerProfile`, referred
`CustomerProfile`, code, status, reward) and a `ReferralReward` ledger; `src/repositories/referrals.ts`;
`src/modules/referrals/referral-service.ts` holding eligibility and reward rules; the reward enters
pricing as a `discountCents` input or as `Subscription.creditCents`, never as its own calculation; a
`REFERRAL_REWARDED` subscription event when it is applied; `/api/v1/referrals` endpoints gated by new
`referrals.view` / `referrals.edit` permissions; a `Referrals` admin module and sidebar entry; a
referral code on `/account`; a `referral.rewarded` notification template; tests for the eligibility
rules and the endpoint authorization.

## Change management

For any change, in order:

1. Inspect the current implementation.
2. Read this skill.
3. Identify the affected modules.
4. Work out the database impact — new columns, migration, backward compatibility with existing rows.
5. Work out the API impact — new endpoints, changed shapes, permissions, `API.md`.
6. Work out the pricing impact — does anything reach `calculatePrice` differently?
7. Work out the subscription lifecycle impact — new transition, new event, new status?
8. Implement.
9. Test: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and run it.
10. Update this skill if the architecture changed.

## Decision log

| Decision | Reason | Date | Affected modules |
| --- | --- | --- | --- |
| API-first architecture at `/api/v1` | One contract for the web client, future mobile clients, and integrations; one place for authorization | 2026-10-02 | `src/server`, all clients |
| Server components may read through repositories | Avoids an HTTP hop for server-rendered catalogue and account pages; costs a second place where scoping must be applied | 2026-10-02 | `src/app`, `src/repositories` |
| MySQL as the initial database | Familiar to the team, cheap to host, adequate for the workload | 2026-10-02 | `prisma`, `src/database`, Docker |
| Prisma as the ORM | Typed client, first-class migrations, driver adapters | 2026-10-02 | `prisma`, `src/repositories` |
| Repository abstraction over Prisma | Keeps the business modules free of Prisma so they stay pure and testable, and so the database can be replaced | 2026-10-02 | `src/repositories`, `src/modules` |
| Modular monolith, not microservices | One deployable for a small team; modules give the separation without the operational cost | 2026-10-02 | whole app |
| Plan Builder as the single plan model | Plans must be data so an administrator can change what is sold without a deploy | 2026-10-02 | `prisma`, `src/repositories/plans`, admin |
| Subscription Engine as a pure state machine | Lifecycle rules are the highest-risk logic; keeping them pure makes them testable and keeps them in one place | 2026-10-02 | `src/modules/subscriptions` |
| WordPress-like admin | The business must run itself without developer involvement | 2026-10-02 | `src/app/admin`, `src/components/admin` |
| Single pricing service | Pricing drift between storefront, checkout, and renewal is the classic failure in this domain | 2026-10-02 | `src/modules/pricing` |
| Immutable order and subscription price snapshots | A price change must never alter a completed transaction | 2026-10-02 | `prisma`, `src/modules/orders`, `src/repositories/billing` |
| Money as integer centavos | No floating-point money | 2026-10-02 | whole app |
| Docker Compose with ports 3017 and 3317 | Avoids collisions with other local projects on 3000 and 3306; both are `.env`-driven | 2026-10-02 | Docker, `package.json`, `.env.example` |
| Auth.js credentials with JWT sessions | No external identity provider needed for the first store | 2026-10-02 | `src/auth.ts`, `src/server/api.ts` |
| Permission-key RBAC with role presets | Administrators can build a role without a developer | 2026-10-02 | `src/modules/auth` |
| Partial plan updates leave absent child collections unchanged | The previous unconditional delete destroyed a plan's items and variants on every admin edit | 2026-10-03 | `src/repositories/plans` |
| `renew` is staff-only | It advances the paid period and charges the provider; a customer could self-extend indefinitely | 2026-10-03 | `src/server/api.ts` |

## Skill change policy

Update this skill whenever any of the following changes: the architecture, the database schema,
subscription behaviour, pricing behaviour, API conventions, admin conventions, the Docker setup, or a
major business rule.

Do not blindly append. Edit the section that is now wrong, delete instructions that no longer apply,
and keep the "Known gaps" notes honest — when a gap is closed, remove it rather than leaving a stale
warning. Add a row to the decision log when a decision is made or reversed. Keep this file describing
what the code does, not what someone intended it to do.
