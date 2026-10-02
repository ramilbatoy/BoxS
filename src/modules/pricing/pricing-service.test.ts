import { describe, expect, it } from "vitest";
import { calculatePrice, equivalentPrices } from "./pricing-service";

describe("pricing engine", () => {
  it("matches the published meal example", () => {
    const price = calculatePrice({
      basePriceCents: 250_000,
      variantDeltaCents: 30_000,
      deliveryFeeCents: 20_000,
      coupon: { type: "FIXED", value: 25_000 },
    });
    expect(price.totalCents).toBe(275_000);
    expect(price.lines.find((line) => line.label === "Base plan")?.amountCents).toBe(250_000);
  });

  it("adds tax before discounts and coupons", () => {
    const price = calculatePrice({
      basePriceCents: 100_000,
      taxRateBps: 1000,
      discountCents: 5_000,
    });
    expect(price.taxCents).toBe(10_000);
    expect(price.totalCents).toBe(105_000);
  });

  it("applies a percentage coupon and never goes below zero", () => {
    const price = calculatePrice({
      basePriceCents: 10_000,
      coupon: { type: "PERCENT", value: 150 },
    });
    expect(price.totalCents).toBe(0);
  });

  it("computes daily, weekly, and monthly equivalents", () => {
    const equivalents = equivalentPrices(70_000, 7);
    expect(equivalents.dailyCents).toBe(10_000);
    expect(equivalents.weeklyCents).toBe(70_000);
    expect(equivalents.monthlyCents).toBe(300_000);
  });
});
