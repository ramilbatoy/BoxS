import { describe, expect, it } from "vitest";
import { buildOrderSnapshot } from "./snapshot";

describe("order snapshots", () => {
  it("keeps the charged amount after the live plan price changes", () => {
    const plan = { id: "p1", name: "Balanced", slug: "balanced", version: 1, basePriceCents: 250_000 };
    const snapshot = buildOrderSnapshot({
      plan,
      options: [],
      addons: [],
      products: [],
      totals: { discountCents: 0, taxCents: 0, deliveryFeeCents: 0, couponCents: 0, totalCents: 250_000 },
      customer: { name: "Liza", email: "liza@boxs.demo" },
    });
    plan.basePriceCents = 280_000;
    expect(snapshot.plan.basePriceCents).toBe(250_000);
    expect(snapshot.totals.totalCents).toBe(250_000);
  });
});
