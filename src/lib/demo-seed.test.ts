import { describe, expect, it } from "vitest";
import { shouldSeedDemo } from "./demo-seed";

describe("demo seed", () => {
  it("skips production unless seeding is requested", () => {
    expect(shouldSeedDemo({ NODE_ENV: "production" })).toBe(false);
    expect(shouldSeedDemo({ NODE_ENV: "production", SEED_DEMO: "true" })).toBe(true);
    expect(shouldSeedDemo({ NODE_ENV: "development" })).toBe(true);
    expect(shouldSeedDemo({})).toBe(true);
  });
});
