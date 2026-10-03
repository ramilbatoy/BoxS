#!/bin/sh
set -e
echo "Waiting for MySQL at ${MYSQL_HOST:-mysql}:${MYSQL_PORT:-3306}..."
i=0
until node --input-type=module -e "
import mariadb from 'mariadb';
const conn = await mariadb.createConnection({
  host: process.env.MYSQL_HOST || 'mysql',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'subscription_user',
  password: process.env.MYSQL_PASSWORD || 'subscription_pass',
  database: process.env.MYSQL_DATABASE || 'subscription_db',
});
await conn.end();
"; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "MySQL did not become ready."
    exit 1
  fi
  sleep 2
done
echo "Generating the database client..."
npx prisma generate
echo "Applying migrations..."
npx prisma migrate deploy
# Development seeds. Production migrates and skips the demo seed unless SEED_DEMO=true.
if [ "$NODE_ENV" = "production" ] && [ "$SEED_DEMO" != "true" ]; then
  echo "Skipping demo seed."
else
  echo "Seeding demo data..."
  npx tsx prisma/seed.ts
fi
exec "$@"
