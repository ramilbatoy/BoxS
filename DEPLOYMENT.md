# Deployment

## Local Docker

```bash
cp .env.example .env
docker compose up -d
```

Containers:

- `subscription_platform_app` — Next.js, host `APP_PORT` to container `3000`
- `subscription_platform_mysql` — MySQL 8.4, host `MYSQL_PORT` to container `3306`
- network `subscription_platform_network`
- volume `subscription_platform_mysql_data`

The app waits until MySQL answers, generates the Prisma client, applies migrations, and seeds. The seed skips itself once the demo admin exists.

Development Compose bind-mounts the repo and keeps `node_modules` in a named volume so hot reload works.

```bash
docker compose down        # keeps data
docker compose down -v     # deletes the database volume
```

## Production Compose

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The Dockerfile stages are `dependencies`, `development`, `builder`, and `runner`. The runner uses Next.js standalone output and still includes the Prisma CLI so the entrypoint can migrate. Set a real `AUTH_SECRET` and `PAYMENT_SECRET` in `.env` before this. Do not commit `.env`.

## Environment

See `.env.example`. Secrets stay on the server. `NEXT_PUBLIC_APP_URL` is the only public URL the browser needs.

Payment, email, and SMS variables are placeholders. The built-in payment providers (`manual`, `cod`, `bank_transfer`) work without them. A future Stripe, PayPal, Xendit, PayMongo, or GCash provider implements `PaymentProvider` and reads its secret from the environment.

## Changing ports

```env
APP_PORT=3018
MYSQL_PORT=3318
DATABASE_URL=mysql://subscription_user:subscription_pass@127.0.0.1:3318/subscription_db
NEXT_PUBLIC_APP_URL=http://localhost:3018
AUTH_URL=http://localhost:3018
NEXTAUTH_URL=http://localhost:3018
```

Compose still maps those host ports onto container `3000` and `3306`. The in-network database host stays `mysql`.
