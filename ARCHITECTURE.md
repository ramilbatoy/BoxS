# Architecture

BoxS is a modular monolith.

```text
Browser
  → Next.js App Router
  → /api/v1
  → services (pricing, coupons, subscriptions, checkout, payments, webhooks)
  → repository interfaces implemented in src/repositories
  → Prisma adapter
  → MySQL
```

React components do not calculate prices and do not talk to MySQL. Server pages may call repositories for reads. Writes from the browser go through `/api/v1`.

## Modules

`src/modules` holds business rules that do not import Prisma:

- `pricing` — one formula used by the storefront, plan builder preview, checkout, orders, and renewals
- `subscriptions` — durations, lifecycle, pause, resume, skip, cancel, renew, plan change
- `coupons` — eligibility and discount amount
- `payments` — provider interface plus manual, cash on delivery, and bank transfer
- `delivery` — cutoff and capacity checks
- `webhooks` — signature check and idempotent processing
- `auth` — permission keys and role presets
- `orders` — snapshot shape
- `plans` — option selection and public preview
- `checkout` — quote then persist

`src/repositories` is the only place, besides `src/database/client.ts` and the seed, that imports Prisma.

To add a module:

1. Add tables in `prisma/schema.prisma` and a migration.
2. Add a repository function.
3. Add a branch in `src/server/api.ts`.
4. Add a permission key in `src/modules/auth/permissions.ts`.
5. Add a nav entry in `src/app/admin/layout.tsx` and a row in the admin record browser.

## Pricing

```text
base + variant + add-ons + delivery
− built-in discount
+ tax
− coupon
= total
```

Money is stored as integer centavos. The admin forms show pesos.

Publishing a plan writes a `PlanVersion`. Checkout copies the quote into `OrderSnapshot`. Later edits do not change historical orders or the price already stored on a subscription.

## Subscriptions

Durations come from plan option groups, not from hard-coded pages. A type is one-time or recurring, with a day, week, or month interval. Statuses: pending, active, paused, past due, suspended, cancelled, expired, completed. Every action writes a subscription event.

Plan changes compare the current snapshotted price with a new quote and record credit or an extra charge. They do not overwrite the old subscription row in place without an event.

## Payments

`PaymentProvider` exposes create, authorize, capture, refund, status, and recurring create/cancel. Built-in providers need no third-party account. A new provider implements the same interface and is registered in `src/modules/payments/builtin-providers.ts`.

Webhooks are stored by provider and event id. A duplicate event is ignored.

## Auth

Auth.js credentials sessions. The JWT carries the role slug and permission keys. API handlers call `can()` before staff actions. Customers can only act on their own subscriptions.

## Database independence

Services accept plain records. Replacing MySQL means a new repository implementation with the same function signatures. Prisma is the current adapter, not the domain model.
