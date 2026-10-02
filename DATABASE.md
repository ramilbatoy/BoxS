# Database

MySQL 8.4. Prisma schema: `prisma/schema.prisma`. Migration: `prisma/migrations/20261002163441_init`.

Connection from the host:

```text
mysql://subscription_user:subscription_pass@127.0.0.1:3317/subscription_db
```

Connection inside Docker:

```text
mysql://subscription_user:subscription_pass@mysql:3306/subscription_db
```

The volume `subscription_platform_mysql_data` survives `docker compose down`.

## Tables

Users and access: `User`, `Role`, `Permission`, `RolePermission`, `CustomerProfile`, `Address`, `PaymentMethod`, `ApiKey`.

Catalog: `Category`, `Product`, `ProductVariant`, `Addon`.

Plans: `SubscriptionType`, `Plan`, `PlanVersion`, `PlanOptionGroup`, `PlanOption`, `PlanItem`.

Subscriptions: `Subscription`, `SubscriptionItem`, `SubscriptionEvent`.

Commerce: `Order`, `OrderItem`, `OrderSnapshot`, `Payment`, `PaymentTransaction`, `Coupon`, `CouponRedemption`.

Delivery: `DeliveryZone`, `DeliverySchedule`, `DeliveryAssignment`.

Content: `Page`, `PageBlock`, `Menu`, `MenuItem`, `Faq`, `Media`.

System: `Setting`, `FeatureFlag`, `Notification`, `NotificationTemplate`, `AuditLog`, `WebhookEvent`, `ContactMessage`.

Soft delete uses `deletedAt` on catalog and plan records. Orders and subscriptions are status changes, not deletes. Prices on orders and subscriptions are copies, not live foreign prices.

## Seed

`prisma/seed.ts` is idempotent. If `admin@boxs.demo` exists it exits. Demo data uses PHP and Davao City: five categories, twelve products, six plans (including a studio membership and a home service), customers, one completed checkout, coupons `WELCOME10`, `DAVAO50`, and `EXPIRED`, and a Davao delivery zone (Monday–Saturday, 06:00–09:00, cutoff 20:00 the previous day).
