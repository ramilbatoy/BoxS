import { describe, expect, it } from "vitest";
import { evaluateCoupon, type CouponRecord } from "./coupon-service";

const coupon: CouponRecord = {
  code: "WELCOME10",
  type: "PERCENT",
  value: 10,
  scope: "NEW_CUSTOMER",
  planId: null,
  categoryId: null,
  minSubtotalCents: 0,
  maxUses: 100,
  perCustomerLimit: 1,
  startsAt: null,
  endsAt: new Date("2026-12-31T23:59:59.000Z"),
  active: true,
};

const context = {
  now: new Date("2026-10-02T00:00:00.000Z"),
  subtotalCents: 250_000,
  planId: "plan",
  categoryId: "cat",
  totalRedemptions: 0,
  customerRedemptions: 0,
  isNewCustomer: true,
  isFirstSubscription: true,
};

describe("coupons", () => {
  it("gives a new customer 10 percent", () => {
    const result = evaluateCoupon(coupon, context);
    expect(result.ok && result.amountCents).toBe(25_000);
  });

  it("rejects an expired coupon", () => {
    const result = evaluateCoupon(coupon, { ...context, now: new Date("2027-01-01T00:00:00.000Z") });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("COUPON_EXPIRED");
  });

  it("rejects a second use by the same customer", () => {
    const result = evaluateCoupon(coupon, { ...context, customerRedemptions: 1 });
    expect(result.ok).toBe(false);
  });

  it("enforces a minimum and a plan scope", () => {
    const minimum = evaluateCoupon(
      { ...coupon, scope: "ALL", minSubtotalCents: 300_000 },
      context,
    );
    expect(minimum.ok).toBe(false);
    const plan = evaluateCoupon(
      { ...coupon, scope: "PLAN", planId: "other" },
      context,
    );
    expect(plan.ok).toBe(false);
  });
});
