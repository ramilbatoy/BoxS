# Run BoxS on your machine

The GitHub repo is [ramilbatoy/BoxS](https://github.com/ramilbatoy/BoxS). Default branch is `main`. Latest commit on `main`: `98a42ef18686f9d797c3d886da5b9ff6267b90d6`.

Put the checkout at `./desktop/git/BoxS` (`~/Desktop/git/BoxS` on your Mac).

## Clone

SSH:

```bash
mkdir -p ~/Desktop/git
git clone git@github.com:ramilbatoy/BoxS.git ~/Desktop/git/BoxS
cd ~/Desktop/git/BoxS
```

The same repo over HTTPS is `https://github.com/ramilbatoy/BoxS.git`.

If that folder already exists and is this repo:

```bash
cd ~/Desktop/git/BoxS
git pull origin main
```

## Environment

```bash
cp .env.example .env
```

Do not commit `.env`. The example file is safe to copy for a local demo. It sets:

- `APP_PORT=3017` — Next.js on the host
- `MYSQL_PORT=3317` — MySQL on the host
- `DATABASE_URL=mysql://subscription_user:subscription_pass@127.0.0.1:3317/subscription_db` for tools you run on the host

Inside Docker Compose the app uses `mysql:3306` on the Compose network. The compose file sets that `DATABASE_URL` itself. You do not install MySQL on the Mac.

If 3017 or 3317 is already taken:

```bash
npm run docker:check
```

Then change `APP_PORT` and `MYSQL_PORT` in `.env` (and the host port inside `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `AUTH_URL`, and `NEXTAUTH_URL`). Example: `3018` and `3318`. Do not edit source to move the ports.

## Start

Docker is the path that brings up both the app and MySQL:

```bash
docker compose up -d
```

That starts `subscription_platform_mysql` and `subscription_platform_app`. The app container waits until MySQL is healthy, generates the Prisma client, applies migrations, seeds demo data, then runs `npm run dev:docker` on container port 3000. The host port is `APP_PORT` (3017).

Open [http://localhost:3017](http://localhost:3017).

Useful commands from `package.json`:

```bash
npm run docker:ps
npm run docker:logs
npm run docker:down
```

`docker compose down` keeps the database volume `subscription_platform_mysql_data`. `docker compose down -v` deletes it.

Source is mounted into the app container. Save a file and Next.js reloads. You do not rebuild the image for a source edit.

Host-only Next, once MySQL is already up on 3317:

```bash
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

`npm run dev` listens on `APP_PORT` (3017). The seed exits if `admin@boxs.demo` already exists, so running it twice is safe.

## Demo logins

| Who | Email | Password |
| --- | --- | --- |
| Super admin | admin@boxs.demo | DemoAdmin123! |
| Manager | manager@boxs.demo | DemoAdmin123! |
| Customer | paolo@boxs.demo | DemoCustomer123! |
| Customer | liza@boxs.demo | DemoCustomer123! |

Open the site on `http://localhost:3017`, matching `AUTH_URL` in `.env`.

## Manual check

1. Home: [http://localhost:3017](http://localhost:3017) shows BoxS, not a Next.js starter. Prices use ₱.
2. Plans: [http://localhost:3017/plans](http://localhost:3017/plans) lists the seeded plans. Open [http://localhost:3017/plans/balanced-table](http://localhost:3017/plans/balanced-table). The live total is a peso amount. Continue moves to the next step. Changing a duration changes the total.
3. Sign in: [http://localhost:3017/login](http://localhost:3017/login) with `admin@boxs.demo` / `DemoAdmin123!` lands on `/admin`. The dashboard shows revenue and subscription counts.
4. Customer: sign in as `paolo@boxs.demo` / `DemoCustomer123!`. That account lands on `/account` and has an active subscription.
