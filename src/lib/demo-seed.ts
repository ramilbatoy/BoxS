export function shouldSeedDemo(env: { NODE_ENV?: string; SEED_DEMO?: string } = process.env) {
  if (env.SEED_DEMO === "true") return true;
  return env.NODE_ENV !== "production";
}
