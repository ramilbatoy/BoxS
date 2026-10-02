export type CouponRecord = {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  scope: "ALL" | "PLAN" | "CATEGORY" | "FIRST_SUBSCRIPTION" | "NEW_CUSTOMER";
  planId: string | null;
  categoryId: string | null;
  minSubtotalCents: number;
  maxUses: number | null;
  perCustomerLimit: number;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
};

export type CouponContext = {
  now: Date;
  subtotalCents: number;
  planId: string;
  categoryId: string | null;
  totalRedemptions: number;
  customerRedemptions: number;
  isNewCustomer: boolean;
  isFirstSubscription: boolean;
};

export type CouponDecision =
  | { ok: true; amountCents: number }
  | { ok: false; code: string; message: string };

export function evaluateCoupon(coupon: CouponRecord, context: CouponContext): CouponDecision {
  if (!coupon.active) {
    return { ok: false, code: "COUPON_INACTIVE", message: "This coupon is not active." };
  }
  if (coupon.startsAt && context.now < coupon.startsAt) {
    return { ok: false, code: "COUPON_NOT_STARTED", message: "This coupon is not available yet." };
  }
  if (coupon.endsAt && context.now > coupon.endsAt) {
    return { ok: false, code: "COUPON_EXPIRED", message: "This coupon has expired." };
  }
  if (context.subtotalCents < coupon.minSubtotalCents) {
    return { ok: false, code: "COUPON_MINIMUM", message: "This order does not meet the coupon minimum." };
  }
  if (coupon.maxUses != null && context.totalRedemptions >= coupon.maxUses) {
    return { ok: false, code: "COUPON_EXHAUSTED", message: "This coupon has reached its usage limit." };
  }
  if (context.customerRedemptions >= coupon.perCustomerLimit) {
    return { ok: false, code: "COUPON_CUSTOMER_LIMIT", message: "You have already used this coupon." };
  }
  if (coupon.scope === "PLAN" && coupon.planId !== context.planId) {
    return { ok: false, code: "COUPON_PLAN", message: "This coupon does not apply to the selected plan." };
  }
  if (coupon.scope === "CATEGORY" && coupon.categoryId !== context.categoryId) {
    return { ok: false, code: "COUPON_CATEGORY", message: "This coupon does not apply to this category." };
  }
  if (coupon.scope === "NEW_CUSTOMER" && !context.isNewCustomer) {
    return { ok: false, code: "COUPON_NEW_CUSTOMER", message: "This coupon is only for new customers." };
  }
  if (coupon.scope === "FIRST_SUBSCRIPTION" && !context.isFirstSubscription) {
    return { ok: false, code: "COUPON_FIRST_SUBSCRIPTION", message: "This coupon is only for a first subscription." };
  }
  const amountCents =
    coupon.type === "PERCENT" ? Math.round((context.subtotalCents * coupon.value) / 100) : coupon.value;
  return { ok: true, amountCents: Math.max(0, amountCents) };
}
