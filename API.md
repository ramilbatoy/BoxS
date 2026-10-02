# API

Base path: `/api/v1`.

Success:

```json
{ "success": true, "data": {} }
```

Failure:

```json
{ "success": false, "error": { "code": "PLAN_NOT_FOUND", "message": "The selected plan could not be found." } }
```

Staff routes require a signed-in session whose role includes the permission. Customer routes require any signed-in user and are scoped to that user.

## Catalog and plans

| Method | Path | Who |
| --- | --- | --- |
| GET | `/plans` | Public. `published=1` hides drafts. |
| GET | `/plans/slug/:slug` | Public |
| GET | `/plans/:id` | Public |
| POST | `/plans` | `plans.create` |
| PATCH | `/plans/:id` | `plans.edit` |
| DELETE | `/plans/:id` | `plans.delete` |
| POST | `/plans/:id/publish` | `plans.edit` |
| POST | `/plans/bulk` | `plans.edit` |
| GET/POST | `/categories`, `/products`, `/addons` | Public read, staff write |
| POST | `/products/import` | CSV body `{ "csv": "..." }` |
| GET/POST | `/subscription-types` | Public read, `plans.create` to add a type |
| POST | `/pricing/quote` | Public live price |

## Checkout and account

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/checkout` | Signed in. Send `Idempotency-Key`. |
| POST | `/register` | Rate limited |
| GET/PATCH | `/account` | Profile and password |
| GET/POST | `/account/addresses` | |
| GET | `/subscriptions` | Staff see all. Customers see their own. |
| GET | `/subscriptions/:id` | |
| POST | `/subscriptions/:id/actions` | `pause`, `resume`, `skip`, `cancel`, `renew`, `change_plan`, `change_address`, `change_delivery_date` |
| GET | `/orders` | Scoped the same way |
| PATCH | `/orders/:id` | `orders.edit` |
| POST | `/orders/bulk` | confirm, delivered, preparing, otherwise cancel |

## Operations

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/payments` | `payments.view` |
| POST | `/payments/:id/refund` | `payments.refund` |
| GET/POST | `/delivery/zones` | edit requires `deliveries.edit` |
| POST | `/delivery/schedules` | `deliveries.edit` |
| GET | `/deliveries` | `deliveries.view` |
| GET/POST/PATCH | `/coupons` | `coupons.edit` to write |
| GET/POST/PATCH | `/pages`, `/faqs` | `content.edit` to write |
| PATCH | `/menus/:id` | `{ "items": [{ "label", "href", "sortOrder" }] }` |
| GET/POST | `/media` | metadata. Files use `POST /api/v1/media/upload` |
| GET | `/reports?range=30d` | `reports.view`. Ranges: `today`, `7d`, `30d`, `90d`, `year`, `custom` with `from` and `to` |
| GET | `/search?q=` | Signed in |
| GET | `/exports/:kind` | `customers`, `orders`, `subscriptions`, `products`, `plans` |
| GET/PATCH | `/settings`, `/feature-flags` | `settings.manage` to write |
| GET/POST/PATCH | `/users`, `/roles` | user permissions |
| GET | `/permissions` | |
| GET/PATCH | `/notifications/templates` | `notifications.manage` |
| GET/POST | `/webhooks`, `/webhooks/:provider` | provider post checks `x-webhook-signature` |
| GET/POST/DELETE | `/api-keys` | `api.manage`. The secret is returned once. |
| POST | `/contact` | Public |
| GET | `/health` | Public |

OpenAPI sketch: [docs/openapi.yaml](docs/openapi.yaml).
