# BoxS

BoxS is a subscription platform. Meal delivery is the demo catalog. The same plan builder, pricing service, and subscription engine run memberships and services.

## Run it

```bash
cp .env.example .env
docker compose up -d
```

Open [http://localhost:3017](http://localhost:3017).

MySQL is published on `localhost:3317`. Inside Compose the app uses `mysql:3306`.

Demo accounts (created by the seed):

| Who | Email | Password |
| --- | --- | --- |
| Super admin | admin@boxs.demo | DemoAdmin123! |
| Manager | manager@boxs.demo | DemoAdmin123! |
| Customers | paolo@boxs.demo, liza@boxs.demo | DemoCustomer123! |

## Without rebuilding for every edit

`docker compose up` mounts the source into the app container and runs Next.js in development mode. Save a file and the browser updates. You do not rebuild the image for source changes.

Host tools (Prisma, `npm run dev`) use `DATABASE_URL` pointed at `127.0.0.1` and `MYSQL_PORT`.

```bash
npm install
npm run dev
```

## Ports

`APP_PORT` and `MYSQL_PORT` live in `.env`. Defaults are `3017` and `3317`.

```bash
npm run docker:check
```

If a port is taken, change it in `.env` (for example `APP_PORT=3018` and `MYSQL_PORT=3318`) and start again. Do not edit source to move the port.

## Database

```bash
npm run db:deploy    # apply migrations
npm run db:seed      # demo data, safe to run twice
npm run db:reset     # destructive: drop, migrate, seed
```

`docker compose down` keeps the database. `docker compose down -v` deletes `subscription_platform_mysql_data`.

## Scripts

```bash
npm run docker:up
npm run docker:down
npm run docker:logs
npm run docker:build
npm run docker:restart
npm run docker:ps
npm run docker:check
npm test
npm run lint
```

Production image:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [API.md](API.md)
- [DATABASE.md](DATABASE.md)
- [ADMIN_GUIDE.md](ADMIN_GUIDE.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
