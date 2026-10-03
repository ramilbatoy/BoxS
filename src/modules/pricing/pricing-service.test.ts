import { describe, expect, it } from "vitest";
import { evaluateCoupon, type CouponRecord } from "@/modules/coupons/coupon-service";
import { calculatePrice, equivalentPrices, merchandiseSubtotalCents } from "./pricing-service";

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

  it("discounts merchandise only for a percentage coupon", () => {
    const welcome: CouponRecord = {
      code: "WELCOME10",
      type: "PERCENT",
      value: 10,
      scope: "NEW_CUSTOMER",
      planId: null,
      categoryId: null,
      minSubtotalCents: 0,
      maxUses: null,
      perCustomerLimit: 1,
      startsAt: null,
      endsAt: null,
      active: true,
    };
    const merchandise = merchandiseSubtotalCents({
      basePriceCents: 150_000,
      variantDeltaCents: 20_000,
      addonCents: 0,
    });
    const decision = evaluateCoupon(welcome, {
      now: new Date("2026-10-02T00:00:00.000Z"),
      subtotalCents: merchandise,
      planId: "plan",
      categoryId: null,
      totalRedemptions: 0,
      customerRedemptions: 0,
      isNewCustomer: true,
      isFirstSubscription: true,
    });
    const price = calculatePrice({
      basePriceCents: 150_000,
      variantDeltaCents: 20_000,
      deliveryFeeCents: 20_000,
      taxRateBps: 0,
      coupon: { type: "PERCENT", value: 10 },
    });
    expect(merchandise).toBe(170_000);
    expect(decision.ok && decision.amountCents).toBe(17_000);
    expect(price.couponCents).toBe(17_000);
    expect(price.deliveryFeeCents).toBe(20_000);
    expect(price.totalCents).toBe(173_000);
  });

  it("computes daily, weekly, and monthly equivalents", () => {
    const equivalents = equivalentPrices(70_000, 7);
    expect(equivalents.dailyCents).toBe(10_000);
    expect(equivalents.weeklyCents).toBe(70_000);
    expect(equivalents.monthlyCents).toBe(300_000);
  });
});
