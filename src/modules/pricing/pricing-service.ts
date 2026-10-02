export type CouponDraft = {
  type: "PERCENT" | "FIXED";
  value: number;
};

export type PriceInput = {
  basePriceCents: number;
  variantDeltaCents?: number;
  addonCents?: number;
  deliveryFeeCents?: number;
  taxRateBps?: number;
  discountCents?: number;
  coupon?: CouponDraft | null;
};

export type PriceLine = {
  label: string;
  amountCents: number;
};

export type PriceBreakdown = {
  baseCents: number;
  variantCents: number;
  addonCents: number;
  deliveryFeeCents: number;
  taxCents: number;
  discountCents: number;
  couponCents: number;
  totalCents: number;
  lines: PriceLine[];
};

export function couponAmount(preDiscountCents: number, coupon: CouponDraft) {
  if (coupon.type === "PERCENT") {
    return Math.round((preDiscountCents * coupon.value) / 100);
  }
  return coupon.value;
}

/**
 * Single pricing formula for storefront, plan builder, checkout, admin, orders, and renewals.
 * Base + variant + add-ons + delivery + tax - discounts - coupons.
 */
export function calculatePrice(input: PriceInput): PriceBreakdown {
  const baseCents = input.basePriceCents;
  const variantCents = input.variantDeltaCents ?? 0;
  const addonCents = input.addonCents ?? 0;
  const deliveryFeeCents = input.deliveryFeeCents ?? 0;
  const taxRateBps = input.taxRateBps ?? 0;
  const discountCents = input.discountCents ?? 0;
  const preTax = baseCents + variantCents + addonCents + deliveryFeeCents;
  const taxCents = Math.round((preTax * taxRateBps) / 10000);
  const beforeCoupon = preTax + taxCents - discountCents;
  const rawCoupon = input.coupon ? couponAmount(Math.max(0, beforeCoupon), input.coupon) : 0;
  const couponCents = Math.min(Math.max(0, rawCoupon), Math.max(0, beforeCoupon));
  const totalCents = Math.max(0, beforeCoupon - couponCents);

  const lines: PriceLine[] = [
    { label: "Base plan", amountCents: baseCents },
    { label: "Options", amountCents: variantCents },
    { label: "Add-ons", amountCents: addonCents },
    { label: "Delivery", amountCents: deliveryFeeCents },
    { label: "Tax", amountCents: taxCents },
    { label: "Discount", amountCents: -discountCents },
    { label: "Coupon", amountCents: -couponCents },
  ];

  return {
    baseCents,
    variantCents,
    addonCents,
    deliveryFeeCents,
    taxCents,
    discountCents,
    couponCents,
    totalCents,
    lines,
  };
}

export function equivalentPrices(totalCents: number, durationDays: number) {
  const days = Math.max(1, durationDays);
  const dailyCents = Math.round(totalCents / days);
  return {
    dailyCents,
    weeklyCents: dailyCents * 7,
    monthlyCents: dailyCents * 30,
  };
}
