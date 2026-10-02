import net from "node:net";
import fs from "node:fs";

function loadEnv(path) {
  if (!fs.existsSync(path)) return {};
  const env = {};
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
}

function canBind(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}

const env = { ...loadEnv(".env.example"), ...loadEnv(".env") };
const appPort = Number(env.APP_PORT || 3017);
const mysqlPort = Number(env.MYSQL_PORT || 3317);
let failed = false;

for (const [name, port] of [
  ["APP_PORT", appPort],
  ["MYSQL_PORT", mysqlPort],
]) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`${name} is not a valid port: ${port}`);
    failed = true;
    continue;
  }
  const free = await canBind(port);
  if (!free) {
    console.error(
      `${name} ${port} is already in use. Change ${name} in .env (for example APP_PORT=3018 and MYSQL_PORT=3318) and run this check again. Do not edit source code.`,
    );
    failed = true;
  } else {
    console.log(`${name} ${port} is free.`);
  }
}

if (failed) process.exit(1);
console.log("Ports are available.");
